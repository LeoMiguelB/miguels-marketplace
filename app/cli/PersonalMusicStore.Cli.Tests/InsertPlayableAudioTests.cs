using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class InsertPlayableAudioTests
{
    [Fact]
    public void Sql_inserts_all_blob_urls_and_returns_id()
    {
        Assert.Contains("insert into playable_audio", InsertPlayableAudioRow.Sql);
        Assert.Contains("cover_blob_url", InsertPlayableAudioRow.Sql);
        Assert.Contains("returning id", InsertPlayableAudioRow.Sql);
        Assert.Contains("@title", InsertPlayableAudioRow.Sql);
        Assert.Contains("@published", InsertPlayableAudioRow.Sql);
        Assert.Contains("@stream", InsertPlayableAudioRow.Sql);
        Assert.Contains("@download", InsertPlayableAudioRow.Sql);
        Assert.Contains("@cover", InsertPlayableAudioRow.Sql);
        Assert.Contains("bpm", InsertPlayableAudioRow.Sql);
        Assert.Contains("key", InsertPlayableAudioRow.Sql);
        Assert.Contains("@bpm", InsertPlayableAudioRow.Sql);
        Assert.Contains("@key", InsertPlayableAudioRow.Sql);
    }
}
