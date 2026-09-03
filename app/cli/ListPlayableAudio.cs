using Npgsql;
using System.CommandLine;

namespace PersonalMusicStore.Cli;

public static class ListPlayableAudio
{
    public static async Task<int> RunAsync(string databaseUrl)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        const string sql = "SELECT id, title, published, bpm, key, created_at FROM playable_audio ORDER BY created_at DESC";
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Console.WriteLine($"{"ID",-5} | {"Title",-25} | {"Pub",-5} | {"BPM",-5} | {"Key",-8} | {"Created At"}");
        Console.WriteLine(new string('-', 75));
        while (await reader.ReadAsync())
        {
            var id = reader.GetInt32(0);
            var title = reader.GetString(1);
            var published = reader.GetBoolean(2);
            var bpm = reader.IsDBNull(3) ? "-" : reader.GetInt32(3).ToString();
            var key = reader.IsDBNull(4) ? "-" : reader.GetString(4);
            var createdAt = reader.GetDateTime(5).ToString("yyyy-MM-dd");
            Console.WriteLine($"{id,-5} | {title,-25} | {published,-5} | {bpm,-5} | {key,-8} | {createdAt}");
        }
        return 0;
    }
}
