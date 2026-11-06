using System.Text.Json;

namespace SkiaScene.Server;

/// <summary>
/// The same scene format as packages/core/src/schema.ts, read with JsonDocument so
/// property order (e.g. where "type" appears) never matters.
/// </summary>
public sealed record Threshold(double At, string Color);

public sealed class SceneNode
{
    public required string Id { get; init; }
    public required string Type { get; init; }
    public double X { get; init; }
    public double Y { get; init; }
    public double Rotation { get; init; }
    public double Opacity { get; init; } = 1;
    public string? Bind { get; init; }

    // Shape-specific fields; unused ones stay at defaults.
    public double W { get; init; }
    public double H { get; init; }
    public double R { get; init; }
    public double X2 { get; init; }
    public double Y2 { get; init; }
    public double Radius { get; init; }
    public double? Value { get; set; }
    public double Min { get; init; }
    public double Max { get; init; } = 100;
    public string? Fill { get; init; }
    public string? Stroke { get; init; }
    public double StrokeWidth { get; init; } = 1;
    public string? Color { get; init; }
    public bool Dashed { get; init; }
    public string Text { get; init; } = "";
    public double Size { get; init; } = 16;
    public string Weight { get; init; } = "regular";
    public string Align { get; init; } = "left";
    public string? Label { get; init; }
    public string Units { get; init; } = "";
    public List<double> Values { get; init; } = [];
    public int MaxPoints { get; init; } = 60;
    public List<Threshold> Thresholds { get; init; } = [];
}

public sealed class Scene
{
    public int Width { get; init; }
    public int Height { get; init; }
    public string Background { get; init; } = "#0f172a";
    public List<SceneNode> Nodes { get; init; } = [];

    private static readonly HashSet<string> KnownTypes =
        ["rect", "circle", "line", "text", "gauge", "bar", "sparkline"];

    public static Scene Parse(JsonElement root)
    {
        int width = root.GetProperty("width").GetInt32();
        int height = root.GetProperty("height").GetInt32();
        if (width is <= 0 or > 4096 || height is <= 0 or > 4096)
            throw new SceneException("width and height must be between 1 and 4096");

        var nodes = new List<SceneNode>();
        var ids = new HashSet<string>();
        if (root.TryGetProperty("nodes", out var arr))
        {
            foreach (var n in arr.EnumerateArray())
            {
                var node = ParseNode(n);
                if (!ids.Add(node.Id)) throw new SceneException($"duplicate node id \"{node.Id}\"");
                nodes.Add(node);
            }
        }
        return new Scene { Width = width, Height = height, Background = Str(root, "background") ?? "#0f172a", Nodes = nodes };
    }

    private static SceneNode ParseNode(JsonElement n)
    {
        var type = Str(n, "type") ?? throw new SceneException("node is missing \"type\"");
        if (!KnownTypes.Contains(type)) throw new SceneException($"unknown node type \"{type}\"");
        var thresholds = new List<Threshold>();
        if (n.TryGetProperty("thresholds", out var t))
            foreach (var th in t.EnumerateArray())
                thresholds.Add(new Threshold(th.GetProperty("at").GetDouble(), th.GetProperty("color").GetString()!));
        var values = new List<double>();
        if (n.TryGetProperty("values", out var v))
            foreach (var x in v.EnumerateArray()) values.Add(x.GetDouble());

        return new SceneNode
        {
            Id = Str(n, "id") ?? throw new SceneException("node is missing \"id\""),
            Type = type,
            X = Num(n, "x"), Y = Num(n, "y"),
            Rotation = Num(n, "rotation"), Opacity = Num(n, "opacity", 1), Bind = Str(n, "bind"),
            W = Num(n, "w"), H = Num(n, "h"), R = Num(n, "r"), X2 = Num(n, "x2"), Y2 = Num(n, "y2"),
            Radius = Num(n, "radius"),
            Value = n.TryGetProperty("value", out var val) && val.ValueKind == JsonValueKind.Number ? val.GetDouble() : null,
            Min = Num(n, "min"), Max = Num(n, "max", 100),
            Fill = Str(n, "fill"), Stroke = Str(n, "stroke"), StrokeWidth = Num(n, "strokeWidth", type == "line" ? 2 : 1),
            Color = Str(n, "color"), Dashed = n.TryGetProperty("dashed", out var d) && d.GetBoolean(),
            Text = Str(n, "text") ?? "", Size = Num(n, "size", 16),
            Weight = Str(n, "weight") ?? "regular", Align = Str(n, "align") ?? "left",
            Label = Str(n, "label"), Units = Str(n, "units") ?? "",
            Values = values, MaxPoints = (int)Num(n, "maxPoints", 60), Thresholds = thresholds,
        };
    }

    private static double Num(JsonElement e, string name, double fallback = 0) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDouble() : fallback;

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    /// <summary>Apply live values by binding key (same rules as applyData in the TS core).</summary>
    public void ApplyData(IReadOnlyDictionary<string, double> data)
    {
        foreach (var n in Nodes)
        {
            if (n.Bind is null || !data.TryGetValue(n.Bind, out var v)) continue;
            if (n.Type == "sparkline")
            {
                n.Values.Add(v);
                if (n.Values.Count > n.MaxPoints) n.Values.RemoveRange(0, n.Values.Count - n.MaxPoints);
            }
            else n.Value = v;
        }
    }
}

public sealed class SceneException(string message) : Exception(message);
