using SkiaSharp;

namespace SkiaScene.Server;

/// <summary>
/// SkiaSharp port of packages/core/src/render.ts. Both draw through Skia, so the
/// browser (CanvasKit) and the server produce the same picture from the same JSON.
/// Thread-safe: typefaces are shared and read-only; paints are created per call.
/// </summary>
public sealed class SceneRenderer(SKTypeface regular, SKTypeface semibold)
{
    public byte[] RenderPng(Scene scene)
    {
        var info = new SKImageInfo(scene.Width, scene.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info) ?? throw new InvalidOperationException("Could not create surface");
        Render(surface.Canvas, scene);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    public void Render(SKCanvas canvas, Scene scene)
    {
        canvas.Clear(SKColor.Parse(scene.Background));
        foreach (var n in scene.Nodes)
        {
            canvas.Save();
            if (n.Rotation != 0)
            {
                var b = Bounds(n);
                canvas.RotateDegrees((float)n.Rotation, b.MidX, b.MidY);
            }
            DrawNode(canvas, n);
            canvas.Restore();
        }
    }

    private void DrawNode(SKCanvas c, SceneNode n)
    {
        switch (n.Type)
        {
            case "rect":
            {
                var rect = SKRect.Create((float)n.X, (float)n.Y, (float)n.W, (float)n.H);
                using var fill = Fill(ColorFor(n.Value, n.Fill ?? "#2a2f3a", n.Thresholds), n.Opacity);
                c.DrawRoundRect(rect, (float)n.Radius, (float)n.Radius, fill);
                if (n.Stroke is not null)
                {
                    using var s = Stroke(n.Stroke, n.StrokeWidth, n.Opacity);
                    c.DrawRoundRect(rect, (float)n.Radius, (float)n.Radius, s);
                }
                break;
            }
            case "circle":
            {
                using var fill = Fill(ColorFor(n.Value, n.Fill ?? "#3b82f6", n.Thresholds), n.Opacity);
                c.DrawCircle((float)n.X, (float)n.Y, (float)n.R, fill);
                if (n.Stroke is not null)
                {
                    using var s = Stroke(n.Stroke, n.StrokeWidth, n.Opacity);
                    c.DrawCircle((float)n.X, (float)n.Y, (float)n.R, s);
                }
                break;
            }
            case "line":
            {
                using var p = Stroke(n.Stroke ?? "#94a3b8", n.StrokeWidth, n.Opacity);
                using var dash = n.Dashed ? SKPathEffect.CreateDash([(float)n.StrokeWidth * 3, (float)n.StrokeWidth * 2], 0) : null;
                p.PathEffect = dash;
                c.DrawLine((float)n.X, (float)n.Y, (float)n.X2, (float)n.Y2, p);
                break;
            }
            case "text":
            {
                var text = n.Value is { } v ? n.Text.Replace("{value}", Math.Round(v, 1).ToString()) : n.Text;
                using var font = Font(n.Size, n.Weight);
                using var p = Fill(n.Color ?? "#e2e8f0", n.Opacity);
                var w = font.MeasureText(text);
                var x = n.Align switch { "center" => n.X - w / 2, "right" => n.X - w, _ => n.X };
                c.DrawText(text, (float)x, (float)n.Y, font, p);
                break;
            }
            case "gauge": DrawGauge(c, n); break;
            case "bar": DrawBar(c, n); break;
            case "sparkline": DrawSparkline(c, n); break;
        }
    }

    private void DrawGauge(SKCanvas c, SceneNode n)
    {
        float thickness = (float)Math.Max(4, n.R * 0.16);
        var oval = new SKRect((float)(n.X - n.R), (float)(n.Y - n.R), (float)(n.X + n.R), (float)(n.Y + n.R));
        double value = n.Value ?? n.Min;
        double t = Clamp01((value - n.Min) / (n.Max - n.Min == 0 ? 1 : n.Max - n.Min));

        using (var track = Stroke("#334155", thickness, n.Opacity))
        {
            track.StrokeCap = SKStrokeCap.Round;
            c.DrawArc(oval, 135, 270, false, track);
        }
        if (t > 0)
        {
            using var arc = Stroke(ColorFor(value, n.Color ?? "#22c55e", n.Thresholds), thickness, n.Opacity);
            arc.StrokeCap = SKStrokeCap.Round;
            c.DrawArc(oval, 135, (float)(270 * t), false, arc);
        }

        var valueText = $"{Math.Round(value, 1)}{n.Units}";
        double vs = n.R * 0.42;
        using (var vf = Font(vs, "semibold"))
        using (var vp = Fill("#f8fafc", n.Opacity))
            c.DrawText(valueText, (float)(n.X - vf.MeasureText(valueText) / 2), (float)(n.Y + vs * 0.35), vf, vp);

        if (n.Label is not null)
        {
            double ls = Math.Max(11, n.R * 0.2);
            using var lf = Font(ls, "regular");
            using var lp = Fill("#94a3b8", n.Opacity);
            c.DrawText(n.Label, (float)(n.X - lf.MeasureText(n.Label) / 2), (float)(n.Y + n.R + ls), lf, lp);
        }
    }

    private void DrawBar(SKCanvas c, SceneNode n)
    {
        using (var track = Fill("#1e293b", n.Opacity))
            c.DrawRoundRect(SKRect.Create((float)n.X, (float)n.Y, (float)n.W, (float)n.H), 4, 4, track);
        double value = n.Value ?? n.Min;
        double t = Clamp01((value - n.Min) / (n.Max - n.Min == 0 ? 1 : n.Max - n.Min));
        if (t <= 0) return;
        bool vertical = n.H > n.W;
        var fill = vertical
            ? SKRect.Create((float)n.X, (float)(n.Y + n.H * (1 - t)), (float)n.W, (float)(n.H * t))
            : SKRect.Create((float)n.X, (float)n.Y, (float)(n.W * t), (float)n.H);
        using var p = Fill(ColorFor(value, n.Color ?? "#38bdf8", n.Thresholds), n.Opacity);
        c.DrawRoundRect(fill, 4, 4, p);
    }

    private static void DrawSparkline(SKCanvas c, SceneNode n)
    {
        if (n.Values.Count < 2) return;
        double lo = n.Values.Min(), hi = n.Values.Max(), span = hi - lo == 0 ? 1 : hi - lo;
        double step = n.W / Math.Max(1, n.MaxPoints - 1);
        double offset = (n.MaxPoints - n.Values.Count) * step;
        using var path = new SKPath();
        for (int i = 0; i < n.Values.Count; i++)
        {
            float x = (float)(n.X + offset + i * step);
            float y = (float)(n.Y + n.H - (n.Values[i] - lo) / span * n.H);
            if (i == 0) path.MoveTo(x, y); else path.LineTo(x, y);
        }
        using var p = Stroke(n.Color ?? "#a78bfa", 2, n.Opacity);
        p.StrokeJoin = SKStrokeJoin.Round;
        c.DrawPath(path, p);
    }

    private SKRect Bounds(SceneNode n) => n.Type switch
    {
        "circle" or "gauge" => new SKRect((float)(n.X - n.R), (float)(n.Y - n.R), (float)(n.X + n.R), (float)(n.Y + n.R)),
        "line" => new SKRect((float)Math.Min(n.X, n.X2), (float)Math.Min(n.Y, n.Y2), (float)Math.Max(n.X, n.X2), (float)Math.Max(n.Y, n.Y2)),
        "text" => SKRect.Create((float)n.X, (float)(n.Y - n.Size), (float)(n.Text.Length * n.Size * 0.5), (float)n.Size),
        _ => SKRect.Create((float)n.X, (float)n.Y, (float)n.W, (float)n.H),
    };

    // ---------- helpers ----------

    public static string ColorFor(double? value, string baseColor, List<Threshold> thresholds)
    {
        if (value is null || thresholds.Count == 0) return baseColor;
        var hit = thresholds.Where(t => value >= t.At).OrderBy(t => t.At).LastOrDefault();
        return hit?.Color ?? baseColor;
    }

    private static double Clamp01(double v) => Math.Clamp(v, 0, 1);

    private static SKPaint Fill(string color, double opacity)
    {
        var c = SKColor.Parse(color);
        return new SKPaint { IsAntialias = true, Color = c.WithAlpha((byte)(c.Alpha * opacity)) };
    }

    private static SKPaint Stroke(string color, double width, double opacity)
    {
        var p = Fill(color, opacity);
        p.Style = SKPaintStyle.Stroke;
        p.StrokeWidth = (float)width;
        return p;
    }

    private SKFont Font(double size, string weight) =>
        new(weight == "semibold" ? semibold : regular, (float)size) { Subpixel = true };
}
