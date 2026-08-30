using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class CreatePlayableAudioTests
{
    private static async Task<(int Exit, string Stdout, string Stderr)> Invoke(
        HttpStatusCode status,
        string json)
    {
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
            stdout,
            stderr);
        return (exit, stdout.ToString(), stderr.ToString());
    }

    [Fact]
    public async Task Unauthorized_prints_secret_failed()
    {
        var (exit, _, stderr) = await Invoke(HttpStatusCode.Unauthorized, """{"error":"unauthorized"}""");
        Assert.Equal(1, exit);
        Assert.Contains("secret failed", stderr);
    }

    [Fact]
    public async Task NotImplemented_prints_server_message()
    {
        var (exit, stdout, _) = await Invoke(HttpStatusCode.NotImplemented, """{"error":"not implemented"}""");
        Assert.Equal(0, exit);
        Assert.Contains("not implemented", stdout);
    }

    [Fact]
    public async Task UnexpectedStatus_prints_short_message_not_raw_body()
    {
        var htmlBody = "<html><body><h1>500 Internal Server Error</h1>"
            + string.Concat(Enumerable.Repeat("<p>stack trace line</p>", 50))
            + "</body></html>";
        var (exit, _, stderr) = await Invoke(HttpStatusCode.InternalServerError, htmlBody);
        Assert.Equal(1, exit);
        Assert.Contains("unexpected status", stderr);
        Assert.DoesNotContain("<html>", stderr);
        Assert.DoesNotContain("stack trace line", stderr);
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

        await CreatePlayableAudio.RunAsync(
            http,
            "http://127.0.0.1:3000/api/admin/upload",
            "test-secret",
            file,
            "Title",
            true,
            stdout,
            stderr);

        Assert.Equal(new[] { "file", "title", "published" }, capturingHandler.CapturedPartNames);
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

    private sealed class CapturingHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public CapturingHandler(HttpResponseMessage response) => _response = response;

        public List<string?> CapturedPartNames { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var multipart = Assert.IsType<MultipartFormDataContent>(request.Content);
            CapturedPartNames.AddRange(
                multipart.Select(part => part.Headers.ContentDisposition?.Name?.Trim('"')));
            return Task.FromResult(_response);
        }
    }
}
