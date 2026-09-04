using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class DeletePlayableAudioTests
{
    [Fact]
    public void ResolveBucketAndKey_PathStyle_WithDefaultBucket()
    {
        var url = "http://127.0.0.1:9000/music/stream/track-1";
        var (bucket, key) = DeletePlayableAudio.ResolveBucketAndKey(url, "music");
        Assert.Equal("music", bucket);
        Assert.Equal("stream/track-1", key);
    }

    [Fact]
    public void ResolveBucketAndKey_PathStyle_DualBucket_Private()
    {
        var url = "http://127.0.0.1:9000/music-priv/download/track-2";
        var (bucket, key) = DeletePlayableAudio.ResolveBucketAndKey(url, "music-priv");
        Assert.Equal("music-priv", bucket);
        Assert.Equal("download/track-2", key);
    }

    [Fact]
    public void ResolveBucketAndKey_VirtualHostStyle()
    {
        var url = "https://miguel-music-pub.s3.us-east-005.backblazeb2.com/stream/track-3";
        var (bucket, key) = DeletePlayableAudio.ResolveBucketAndKey(url, "miguel-music-pub");
        Assert.Equal("miguel-music-pub", bucket);
        Assert.Equal("stream/track-3", key);
    }

    [Fact]
    public void ResolveBucketAndKey_CustomCdnUrl()
    {
        var url = "https://cdn.example.com/cover/track-4";
        var (bucket, key) = DeletePlayableAudio.ResolveBucketAndKey(url, "miguel-music-pub");
        Assert.Equal("miguel-music-pub", bucket);
        Assert.Equal("cover/track-4", key);
    }

    [Fact]
    public void ResolveBucketAndKey_EmptyDefaultBucket_ParsesFirstSegment()
    {
        var url = "http://127.0.0.1:9000/my-bucket/stream/track-5";
        var (bucket, key) = DeletePlayableAudio.ResolveBucketAndKey(url, "");
        Assert.Equal("my-bucket", bucket);
        Assert.Equal("stream/track-5", key);
    }
}
