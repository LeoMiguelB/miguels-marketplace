using Npgsql;

namespace PersonalMusicStore.Cli;

public static class AnalyticsCommand
{
    public static async Task<int> RunAsync(string databaseUrl, int? id)
    {
        await using var conn = new NpgsqlConnection(InsertPlayableAudioRow.ToNpgsqlConnectionString(databaseUrl));
        await conn.OpenAsync();

        if (id == null)
        {
            const string sql = @"
                SELECT playable_audio_id, SUM(count) 
                FROM installs 
                GROUP BY playable_audio_id 
                ORDER BY playable_audio_id";
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            Console.WriteLine($"{"Audio ID",-10} | {"Total Downloads"}");
            Console.WriteLine(new string('-', 30));
            while (await reader.ReadAsync())
            {
                var audioId = reader.GetInt32(0);
                var total = reader.GetInt64(1);
                Console.WriteLine($"{audioId,-10} | {total}");
            }
        }
        else
        {
            const string sql = @"
                SELECT c.email, c.role, c.instagram, c.x_handle
                FROM installs i
                JOIN contacts c ON i.contact_id = c.id
                WHERE i.playable_audio_id = @id";
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("id", id.Value);
            await using var reader = await cmd.ExecuteReaderAsync();
            Console.WriteLine($"{"Email",-30} | {"Role",-10} | {"Instagram",-15} | {"X Handle"}");
            Console.WriteLine(new string('-', 75));
            while (await reader.ReadAsync())
            {
                var email = reader.GetString(0);
                var role = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var instagram = reader.IsDBNull(2) ? "" : reader.GetString(2);
                var x = reader.IsDBNull(3) ? "" : reader.GetString(3);
                Console.WriteLine($"{email,-30} | {role,-10} | {instagram,-15} | {x}");
            }
        }

        return 0;
    }
}
