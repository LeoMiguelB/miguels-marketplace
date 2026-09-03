using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class NpgsqlConnectionStringTests
{
    [Fact]
    public void ToNpgsqlConnectionString_converts_postgresql_uri()
    {
        var ado = InsertPlayableAudioRow.ToNpgsqlConnectionString(
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
        Assert.Contains("Host=127.0.0.1", ado);
        Assert.Contains("Port=54322", ado);
        Assert.Contains("Username=postgres", ado);
        Assert.Contains("Password=postgres", ado);
        Assert.Contains("Database=postgres", ado);
    }

    [Fact]
    public void ToNpgsqlConnectionString_passes_through_ado_string()
    {
        const string ado = "Host=127.0.0.1;Port=54322;Username=postgres;Password=postgres;Database=postgres";
        Assert.Equal(ado, InsertPlayableAudioRow.ToNpgsqlConnectionString(ado));
    }
}
