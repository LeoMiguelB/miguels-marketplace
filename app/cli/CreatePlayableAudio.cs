namespace PersonalMusicStore.Cli;

public static class CreatePlayableAudio
{
    public static async Task<int> RunAsync(
        HttpClient http,
        string uploadUrl,
        string adminSecret,
        FileInfo file,
        string title,
        bool published,
        TextWriter stdout,
        TextWriter stderr)
    {
        using var content = new MultipartFormDataContent();
        var stream = file.OpenRead();
        content.Add(new StreamContent(stream), "file", file.Name);
        content.Add(new StringContent(title), "title");
        content.Add(new StringContent(published ? "true" : "false"), "published");

        using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl);
        request.Headers.Add("X-Admin-Secret", adminSecret);
        request.Content = content;

        HttpResponseMessage? response = null;
        try
        {
            response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            if ((int)response.StatusCode == 401)
            {
                await stderr.WriteLineAsync("secret failed");
                return 1;
            }

            if ((int)response.StatusCode == 501)
            {
                await stdout.WriteLineAsync(ExtractError(body) ?? "not implemented");
                return 0;
            }

            await stderr.WriteLineAsync($"unexpected status {(int)response.StatusCode}");
            return 1;
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

    private static string? ExtractError(string body)
    {
        const string needle = "\"error\":";
        var idx = body.IndexOf(needle, StringComparison.Ordinal);
        if (idx < 0)
        {
            return null;
        }

        var start = body.IndexOf('"', idx + needle.Length);
        if (start < 0)
        {
            return null;
        }

        var end = body.IndexOf('"', start + 1);
        if (end < 0)
        {
            return null;
        }

        return body[(start + 1)..end];
    }
}
