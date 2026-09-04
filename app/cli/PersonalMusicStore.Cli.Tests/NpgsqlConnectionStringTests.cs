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
        Assert.Contains("SSL Mode=Disable", ado);
    }

    [Fact]
    public void ToNpgsqlConnectionString_handles_remote_supabase_pooler()
    {
        var ado = InsertPlayableAudioRow.ToNpgsqlConnectionString(
            "postgresql://postgres.demoprojectref:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require");
        Assert.Contains("Host=aws-0-us-west-2.pooler.supabase.com", ado);
        Assert.Contains("Port=5432", ado);
        Assert.Contains("Username=postgres.demoprojectref", ado);
        Assert.Contains("Password=secret", ado);
        Assert.Contains("Database=postgres", ado);
        Assert.Contains("SSL Mode=Require", ado);
    }

    [Fact]
    public void ToNpgsqlConnectionString_substitutes_password_placeholder()
    {
        try
        {
            Environment.SetEnvironmentVariable("SUPABASE_DB_PASSWORD", "secret$pass&word");
            var ado = InsertPlayableAudioRow.ToNpgsqlConnectionString(
                "postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres");
            Assert.Contains("Password=secret$pass&word", ado);
            Assert.Contains("Port=6543", ado);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SUPABASE_DB_PASSWORD", null);
        }
    }

    [Fact]
    public void ToNpgsqlConnectionString_passes_through_ado_string()
    {
        const string ado = "Host=127.0.0.1;Port=54322;Username=postgres;Password=postgres;Database=postgres";
        Assert.Equal(ado, InsertPlayableAudioRow.ToNpgsqlConnectionString(ado));
    }
}
