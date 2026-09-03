using Npgsql;
using System.CommandLine;

namespace PersonalMusicStore.Cli;

public static class UpdatePlayableAudio
{
    public static async Task<int> RunAsync(string databaseUrl, int id, string? title, bool? published)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        
        var updates = new List<string>();
        if (title != null) updates.Add("title = @title");
        if (published != null) updates.Add("published = @published");
        
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
