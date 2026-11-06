using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;
using SkiaScene.Server;

var builder = WebApplication.CreateBuilder(args);

// One renderer per process: typefaces load once and are shared across requests.
var fontsDir = Path.Combine(AppContext.BaseDirectory, "fonts");
builder.Services.AddSingleton(new SceneRenderer(
    SKTypeface.FromFile(Path.Combine(fontsDir, "Inter-Regular.otf")),
    SKTypeface.FromFile(Path.Combine(fontsDir, "Inter-SemiBold.otf"))));

// Identical scenes are rendered once: cache PNGs by content hash (bounded by size).
builder.Services.AddMemoryCache(o => o.SizeLimit = 256L * 1024 * 1024);

// Protect CPU-heavy rendering from bursts; each instance limits itself, so the
// service scales horizontally behind a load balancer with no shared state.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddConcurrencyLimiter("render", l =>
    {
        l.PermitLimit = Environment.ProcessorCount * 2;
        l.QueueLimit = 100;
        l.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
});
builder.Services.AddHealthChecks();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
app.UseRateLimiter();
app.MapHealthChecks("/healthz");

app.MapGet("/", () => Results.Ok(new { service = "skia-scene render", endpoints = new[] { "POST /render", "GET /healthz" } }));

// POST /render  body: scene JSON, optional ?data={"pump1.pressure":91}
app.MapPost("/render", async (HttpRequest req, SceneRenderer renderer, IMemoryCache cache, ILogger<Program> log) =>
{
    if (req.ContentLength > 2_000_000) return Results.BadRequest(new { error = "scene too large (max 2 MB)" });

    using var ms = new MemoryStream();
    await req.Body.CopyToAsync(ms);
    var body = ms.ToArray();
    var dataParam = req.Query["data"].ToString();

    var key = Convert.ToHexString(SHA256.HashData([.. body, .. System.Text.Encoding.UTF8.GetBytes(dataParam)]));
    if (cache.TryGetValue(key, out byte[]? cached))
        return Results.File(cached!, "image/png", enableRangeProcessing: false);

    try
    {
        using var doc = JsonDocument.Parse(body);
        var scene = Scene.Parse(doc.RootElement);
        if (!string.IsNullOrEmpty(dataParam))
            scene.ApplyData(JsonSerializer.Deserialize<Dictionary<string, double>>(dataParam) ?? []);

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var png = renderer.RenderPng(scene);
        log.LogInformation("Rendered {Nodes} nodes {W}x{H} in {Ms} ms", scene.Nodes.Count, scene.Width, scene.Height, sw.ElapsedMilliseconds);

        cache.Set(key, png, new MemoryCacheEntryOptions { Size = png.Length, SlidingExpiration = TimeSpan.FromMinutes(10) });
        return Results.File(png, "image/png");
    }
    catch (Exception e) when (e is JsonException or SceneException or KeyNotFoundException or InvalidOperationException)
    {
        return Results.BadRequest(new { error = e.Message });
    }
}).RequireRateLimiting("render");

app.Run();
