using Npgsql;
using System.CommandLine;

namespace PersonalMusicStore.Cli;

public static class ListPlayableAudio
{
    public static async Task<int> RunAsync(string databaseUrl)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();
        const string sql = "SELECT id, title, published FROM playable_audio ORDER BY created_at DESC";
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Console.WriteLine($"{"ID",-5} | {"Title",-30} | {"Published"}");
        Console.WriteLine(new string('-', 55));
        while (await reader.ReadAsync())
        {
            var id = reader.GetInt32(0);
            var title = reader.GetString(1);
            var published = reader.GetBoolean(2);
            Console.WriteLine($"{id,-5} | {title,-30} | {published}");
        }
        return 0;
    }
}
