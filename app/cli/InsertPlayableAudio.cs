using Npgsql;

namespace PersonalMusicStore.Cli;

public static class InsertPlayableAudioRow
{
    public const string Sql =
        """
        insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url, bpm, key)
        values (@title, @published, @stream, @download, @cover, @bpm, @key)
        returning id
        """;

    public static async Task<int> RunAsync(
        string databaseUrl,
        string title,
        bool published,
        string streamBlobUrl,
        string downloadBlobUrl,
        string coverBlobUrl,
        int? bpm = null,
        string? key = null)
    {
        await using var conn = new NpgsqlConnection(ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(Sql, conn);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("published", published);
        cmd.Parameters.AddWithValue("stream", streamBlobUrl);
        cmd.Parameters.AddWithValue("download", downloadBlobUrl);
        cmd.Parameters.AddWithValue("cover", coverBlobUrl);
        cmd.Parameters.AddWithValue("bpm", bpm.HasValue ? bpm.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("key", !string.IsNullOrWhiteSpace(key) ? key : DBNull.Value);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    public static string ToNpgsqlConnectionString(string databaseUrl)
    {
        if (!databaseUrl.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !databaseUrl.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return databaseUrl;
        }

        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "",
            Database = uri.AbsolutePath.TrimStart('/'),
        };
        return builder.ConnectionString;
    }
}
