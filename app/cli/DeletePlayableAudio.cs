using Npgsql;
using Amazon.S3;
using Amazon.S3.Model;

namespace PersonalMusicStore.Cli;

public static class DeletePlayableAudio
{
    public static async Task<int> RunAsync(string databaseUrl, int id, bool force)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        
        string? streamUrl = null, downloadUrl = null, coverUrl = null;
        if (force)
        {
            const string selectSql = "SELECT stream_blob_url, download_blob_url, cover_blob_url FROM playable_audio WHERE id = @id";
            await using var selectCmd = new NpgsqlCommand(selectSql, conn);
            selectCmd.Parameters.AddWithValue("id", id);
            await using var reader = await selectCmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                streamUrl = reader.IsDBNull(0) ? null : reader.GetString(0);
                downloadUrl = reader.IsDBNull(1) ? null : reader.GetString(1);
                coverUrl = reader.IsDBNull(2) ? null : reader.GetString(2);
            }
            else
            {
                await Console.Error.WriteLineAsync($"No playable_audio found with id {id}");
                return 1;
            }
            await reader.CloseAsync();
        }
        
        const string sql = "DELETE FROM playable_audio WHERE id = @id";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0)
        {
            await Console.Error.WriteLineAsync($"No playable_audio found with id {id}");
            return 1;
        }
        
        if (force)
        {
            await DeleteFromS3(streamUrl, downloadUrl, coverUrl);
        }
        
        Console.WriteLine($"Successfully deleted playable_audio with id {id}");
        return 0;
    }

    public static (string bucket, string key) ResolveBucketAndKey(string url, string defaultBucket)
    {
        var uri = new Uri(url);
        var path = uri.AbsolutePath.TrimStart('/');
        var targetBucket = defaultBucket;
        var key = path;

        // Handle path-style URLs: /<bucket-name>/<key>
        if (!string.IsNullOrEmpty(defaultBucket) && path.StartsWith($"{defaultBucket}/"))
        {
            key = path.Substring(defaultBucket.Length + 1);
        }
        else if (string.IsNullOrEmpty(defaultBucket))
        {
            var slashIndex = path.IndexOf('/');
            if (slashIndex > 0)
            {
                targetBucket = path.Substring(0, slashIndex);
                key = path.Substring(slashIndex + 1);
            }
        }

        return (targetBucket, key);
    }

    private static async Task DeleteFromS3(string? streamUrl, string? downloadUrl, string? coverUrl)
    {
        var endpoint = Environment.GetEnvironmentVariable("S3_ENDPOINT");
        var accessKey = Environment.GetEnvironmentVariable("S3_ACCESS_KEY");
        var secretKey = Environment.GetEnvironmentVariable("S3_SECRET_KEY");
        var legacyBucket = Environment.GetEnvironmentVariable("S3_BUCKET");
        var publicBucket = Environment.GetEnvironmentVariable("S3_PUBLIC_BUCKET") ?? legacyBucket;
        var privateBucket = Environment.GetEnvironmentVariable("S3_PRIVATE_BUCKET") ?? legacyBucket;
        var forcePathStyleStr = Environment.GetEnvironmentVariable("S3_FORCE_PATH_STYLE");
        var forcePathStyle = forcePathStyleStr == "true" || forcePathStyleStr == "1";

        if (string.IsNullOrEmpty(endpoint) || string.IsNullOrEmpty(accessKey) || string.IsNullOrEmpty(secretKey))
        {
            await Console.Error.WriteLineAsync("Missing S3 credentials in environment variables, skipping S3 deletion.");
            return;
        }

        var config = new AmazonS3Config
        {
            ServiceURL = endpoint,
            ForcePathStyle = forcePathStyle
        };
        using var client = new AmazonS3Client(accessKey, secretKey, config);

        var targets = new (string? url, string defaultBucket)[]
        {
            (streamUrl, publicBucket ?? ""),
            (downloadUrl, privateBucket ?? ""),
            (coverUrl, publicBucket ?? "")
        };

        foreach (var (url, defaultBucket) in targets)
        {
            if (string.IsNullOrEmpty(url)) continue;

            try
            {
                var (targetBucket, key) = ResolveBucketAndKey(url, defaultBucket);
                if (string.IsNullOrEmpty(targetBucket))
                {
                    await Console.Error.WriteLineAsync($"Could not determine bucket for {url}");
                    continue;
                }

                await client.DeleteObjectAsync(new DeleteObjectRequest
                {
                    BucketName = targetBucket,
                    Key = key
                });
                Console.WriteLine($"Deleted {key} from bucket {targetBucket}");
            }
            catch (Exception ex)
            {
                await Console.Error.WriteLineAsync($"Failed to delete {url} from S3: {ex.Message}");
            }
        }
    }
}
