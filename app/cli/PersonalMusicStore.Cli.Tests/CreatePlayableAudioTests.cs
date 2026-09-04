using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class CreatePlayableAudioTests
{
    private static InsertPlayableAudio NoInsert =>
        (_, _, _, _, _, _, _) => throw new InvalidOperationException("insert should not run");

    private static async Task<(int Exit, string Stdout, string Stderr, bool Inserted)> Invoke(
        HttpStatusCode status,
        string json,
        FileInfo? cover = null,
        InsertPlayableAudio? insert = null,
        int? bpm = null,
        string? key = null)
    {
        var inserted = false;
        InsertPlayableAudio wrapped = async (t, p, s, d, c, b, k) =>
        {
            inserted = true;
            if (insert is null)
            {
                throw new InvalidOperationException("insert should not run");
            }
            return await insert(t, p, s, d, c, b, k);
        };

        var handler = new StubHandler(new HttpResponseMessage(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(handler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var exit = await CreatePlayableAudio.RunAsync(
            http,
            "http://127.0.0.1:3000/api/admin/upload",
            "test-secret",
            file,
            "Title",
            true,
            cover,
            wrapped,
            stdout,
            stderr,
            bpm,
            key);
        return (exit, stdout.ToString(), stderr.ToString(), inserted);
    }

    [Fact]
    public async Task Unauthorized_prints_secret_failed()
    {
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.Unauthorized, """{"error":"unauthorized"}""");
        Assert.Equal(1, exit);
        Assert.Contains("secret failed", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task NotImplemented_is_unexpected_and_does_not_insert()
    {
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.NotImplemented, """{"error":"not implemented"}""");
        Assert.Equal(1, exit);
        Assert.Contains("unexpected status", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task ServiceUnavailable_prints_storage_unavailable_and_does_not_insert()
    {
        var (exit, _, stderr, inserted) = await Invoke(
            HttpStatusCode.ServiceUnavailable,
            """{"error":"storage unavailable"}""");
        Assert.Equal(1, exit);
        Assert.Contains("storage unavailable", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task Ok_inserts_and_prints_id()
    {
        InsertPlayableAudio insert = (_, _, stream, download, cover, bpm, key) =>
        {
            Assert.Equal("http://127.0.0.1:9000/music/stream/x", stream);
            Assert.Equal("http://127.0.0.1:9000/music/download/x", download);
            Assert.Equal("", cover);
            Assert.Null(bpm);
            Assert.Null(key);
            return Task.FromResult(42);
        };
        var json = """{"stream_blob_url":"http://127.0.0.1:9000/music/stream/x","download_blob_url":"http://127.0.0.1:9000/music/download/x","cover_blob_url":""}""";
        var (exit, stdout, _, inserted) = await Invoke(HttpStatusCode.OK, json, insert: insert);
        Assert.Equal(0, exit);
        Assert.Contains("42", stdout);
        Assert.True(inserted);
    }

    [Fact]
    public async Task Ok_inserts_with_bpm_and_key()
    {
        InsertPlayableAudio insert = (_, _, stream, download, cover, bpm, key) =>
        {
            Assert.Equal(140, bpm);
            Assert.Equal("C min", key);
            return Task.FromResult(99);
        };
        var json = """{"stream_blob_url":"http://127.0.0.1:9000/music/stream/x","download_blob_url":"http://127.0.0.1:9000/music/download/x","cover_blob_url":""}""";
        var (exit, stdout, _, inserted) = await Invoke(HttpStatusCode.OK, json, insert: insert, bpm: 140, key: "C min");
        Assert.Equal(0, exit);
        Assert.Contains("99", stdout);
        Assert.True(inserted);
    }

    [Fact]
    public async Task UnexpectedStatus_prints_short_message_not_raw_body()
    {
        var htmlBody = "<html><body><h1>500 Internal Server Error</h1>"
            + string.Concat(Enumerable.Repeat("<p>stack trace line</p>", 50))
            + "</body></html>";
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.InternalServerError, htmlBody);
        Assert.Equal(1, exit);
        Assert.Contains("unexpected status", stderr);
        Assert.DoesNotContain("<html>", stderr);
        Assert.DoesNotContain("stack trace line", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task SendFailure_prints_cannot_reach_and_no_stack_trace()
    {
        var handler = new ThrowingHandler(new HttpRequestException("Connection refused"));
        using var http = new HttpClient(handler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var uploadUrl = "http://127.0.0.1:3000/api/admin/upload";

        var exit = await CreatePlayableAudio.RunAsync(
            http,
            uploadUrl,
            "test-secret",
            file,
            "Title",
            true,
            null,
            NoInsert,
            stdout,
            stderr);

        Assert.Equal(1, exit);
        Assert.Contains("cannot reach", stderr.ToString());
        Assert.DoesNotContain("at PersonalMusicStore", stderr.ToString());
        Assert.DoesNotContain("Exception", stderr.ToString());
    }

    [Fact]
    public async Task Request_has_stable_multipart_field_names()
    {
        var capturingHandler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"error":"unauthorized"}""", Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(capturingHandler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var cover = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(cover.FullName, "fake-img");

        await CreatePlayableAudio.RunAsync(
            http,
            "http://127.0.0.1:3000/api/admin/upload",
            "test-secret",
            file,
            "Title",
            true,
            cover,
            NoInsert,
            stdout,
            stderr);

        Assert.Equal(new[] { "file", "title", "published", "cover" }, capturingHandler.CapturedPartNames);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public StubHandler(HttpResponseMessage response) => _response = response;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Assert.True(request.Headers.TryGetValues("X-Admin-Secret", out var values));
            Assert.Equal("test-secret", values.Single());
            Assert.IsType<MultipartFormDataContent>(request.Content);
            return Task.FromResult(_response);
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        private readonly Exception _exception;

        public ThrowingHandler(Exception exception) => _exception = exception;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            throw _exception;
        }
    }

    [Fact]
    public async Task Request_sets_correct_media_types_for_audio_and_cover()
    {
        var capturingHandler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"error":"unauthorized"}""", Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(capturingHandler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var tempWav = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav");
        await File.WriteAllTextAsync(tempWav, "fake-wav");
        var tempPng = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.png");
        await File.WriteAllTextAsync(tempPng, "fake-png");

        try
        {
            await CreatePlayableAudio.RunAsync(
                http,
                "http://127.0.0.1:3000/api/admin/upload",
                "test-secret",
                new FileInfo(tempWav),
                "Title",
                true,
                new FileInfo(tempPng),
                NoInsert,
                stdout,
                stderr);

            Assert.Equal("audio/wav", capturingHandler.CapturedContentTypes["file"]);
            Assert.Equal("image/png", capturingHandler.CapturedContentTypes["cover"]);
        }
        finally
        {
            if (File.Exists(tempWav)) File.Delete(tempWav);
            if (File.Exists(tempPng)) File.Delete(tempPng);
        }
    }

    [Fact]
    public async Task Request_sets_correct_media_types_for_mp3_and_jpeg()
    {
        var capturingHandler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"error":"unauthorized"}""", Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(capturingHandler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var tempMp3 = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.mp3");
        await File.WriteAllTextAsync(tempMp3, "fake-mp3");
        var tempJpg = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.jpg");
        await File.WriteAllTextAsync(tempJpg, "fake-jpg");

        try
        {
            await CreatePlayableAudio.RunAsync(
                http,
                "http://127.0.0.1:3000/api/admin/upload",
                "test-secret",
                new FileInfo(tempMp3),
                "Title",
                true,
                new FileInfo(tempJpg),
                NoInsert,
                stdout,
                stderr);

            Assert.Equal("audio/mpeg", capturingHandler.CapturedContentTypes["file"]);
            Assert.Equal("image/jpeg", capturingHandler.CapturedContentTypes["cover"]);
        }
        finally
        {
            if (File.Exists(tempMp3)) File.Delete(tempMp3);
            if (File.Exists(tempJpg)) File.Delete(tempJpg);
        }
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public CapturingHandler(HttpResponseMessage response) => _response = response;

        public List<string?> CapturedPartNames { get; } = new();
        public Dictionary<string, string?> CapturedContentTypes { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var multipart = Assert.IsType<MultipartFormDataContent>(request.Content);
            foreach (var part in multipart)
            {
                var name = part.Headers.ContentDisposition?.Name?.Trim('"');
                CapturedPartNames.Add(name);
                if (name != null)
                {
                    CapturedContentTypes[name] = part.Headers.ContentType?.MediaType;
                }
            }
            return Task.FromResult(_response);
        }
    }
}
