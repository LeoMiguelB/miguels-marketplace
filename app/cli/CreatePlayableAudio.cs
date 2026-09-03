using System.Net.Http.Headers;
using System.Text.Json;

namespace PersonalMusicStore.Cli;

public delegate Task<int> InsertPlayableAudio(
    string title,
    bool published,
    string streamBlobUrl,
    string downloadBlobUrl,
    string coverBlobUrl,
    int? bpm,
    string? key);

public static class CreatePlayableAudio
{
    public static async Task<int> RunAsync(
        HttpClient http,
        string uploadUrl,
        string adminSecret,
        FileInfo file,
        string title,
        bool published,
        FileInfo? cover,
        InsertPlayableAudio insert,
        TextWriter stdout,
        TextWriter stderr,
        int? bpm = null,
        string? key = null)
    {
        using var content = new MultipartFormDataContent();
        AddFilePart(content, "file", file);
        AddTextPart(content, "title", title);
        AddTextPart(content, "published", published ? "true" : "false");
        if (cover is not null)
        {
            AddFilePart(content, "cover", cover);
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl);
        request.Headers.Add("X-Admin-Secret", adminSecret);
        request.Content = content;

        HttpResponseMessage? response = null;
        try
        {
            response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            var code = (int)response.StatusCode;

            if (code == 401)
            {
                await stderr.WriteLineAsync("secret failed");
                return 1;
            }

            if (code == 400)
            {
                await stderr.WriteLineAsync("bad request");
                return 1;
            }

            if (code == 503)
            {
                await stderr.WriteLineAsync("storage unavailable");
                return 1;
            }

            if (code != 200)
            {
                await stderr.WriteLineAsync($"unexpected status {code}");
                return 1;
            }

            UploadUrls? urls;
            try
            {
                urls = JsonSerializer.Deserialize<UploadUrls>(body);
            }
            catch (JsonException)
            {
                await stderr.WriteLineAsync("unexpected status 200");
                return 1;
            }

            if (urls is null
                || string.IsNullOrWhiteSpace(urls.stream_blob_url)
                || string.IsNullOrWhiteSpace(urls.download_blob_url))
            {
                await stderr.WriteLineAsync("unexpected status 200");
                return 1;
            }

            try
            {
                var id = await insert(
                    title,
                    published,
                    urls.stream_blob_url,
                    urls.download_blob_url,
                    urls.cover_blob_url ?? "",
                    bpm,
                    key);
                await stdout.WriteLineAsync(id.ToString());
                return 0;
            }
            catch
            {
                await stderr.WriteLineAsync("insert failed");
                return 1;
            }
        }
        catch (HttpRequestException)
        {
            await stderr.WriteLineAsync($"cannot reach {uploadUrl}");
            return 1;
        }
        finally
        {
            response?.Dispose();
        }
    }

    private static void AddTextPart(MultipartFormDataContent content, string name, string value)
    {
        var part = new StringContent(value);
        part.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
        {
            Name = $"\"{name}\"",
        };
        content.Add(part);
    }

    private static void AddFilePart(MultipartFormDataContent content, string name, FileInfo file)
    {
        var part = new StreamContent(file.OpenRead());
        var ext = file.Extension.ToLowerInvariant();
        var mime = ext switch
        {
            ".wav" => "audio/wav",
            ".mp3" => "audio/mpeg",
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            _ => "application/octet-stream"
        };
        part.Headers.ContentType = new MediaTypeHeaderValue(mime);
        part.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
        {
            Name = $"\"{name}\"",
            FileName = $"\"{file.Name}\"",
        };
        content.Add(part);
    }

    private sealed class UploadUrls
    {
        public string stream_blob_url { get; set; } = "";
        public string download_blob_url { get; set; } = "";
        public string? cover_blob_url { get; set; }
    }
}
