using Npgsql;
using System.CommandLine;

namespace PersonalMusicStore.Cli;

public static class UpdatePlayableAudio
{
    public static async Task<int> RunAsync(
        string databaseUrl,
        int id,
        string? title,
        bool? published,
        int? bpm = null,
        string? key = null)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        
        var updates = new List<string>();
        if (title != null) updates.Add("title = @title");
        if (published != null) updates.Add("published = @published");
        if (bpm.HasValue) updates.Add("bpm = @bpm");
        if (key != null) updates.Add("key = @key");
        
        if (updates.Count == 0)
        {
            Console.WriteLine("No updates specified.");
            return 0;
        }
        
        updates.Add("updated_at = now()");
        var sql = $"UPDATE playable_audio SET {string.Join(", ", updates)} WHERE id = @id";
        
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        if (title != null) cmd.Parameters.AddWithValue("title", title);
        if (published != null) cmd.Parameters.AddWithValue("published", published.Value);
        if (bpm.HasValue) cmd.Parameters.AddWithValue("bpm", bpm.Value);
        if (key != null) cmd.Parameters.AddWithValue("key", key);
        
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0)
        {
            await Console.Error.WriteLineAsync($"No playable_audio found with id {id}");
            return 1;
        }
        Console.WriteLine($"Successfully updated playable_audio with id {id}");
        return 0;
    }
}
