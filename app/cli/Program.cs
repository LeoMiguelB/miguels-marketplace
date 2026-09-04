using System.CommandLine;
using PersonalMusicStore.Cli;

EnvLoader.Load(Path.Combine(AppContext.BaseDirectory, ".env"));
EnvLoader.Load(Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var root = new RootCommand("Admin CLI for the personal music store");

var fileOption = new Option<FileInfo>("--file", "-f")
{
    Description = "Local audio file",
    Required = true,
};
var titleOption = new Option<string>("--title", "-t")
{
    Description = "Title of the file",
    Required = true,
};
var publishedOption = new Option<string>("--published", "-p")
{
    Description = "true or false",
    Required = true,
};
var coverOption = new Option<FileInfo?>("--cover")
{
    Description = "Optional local cover image",
    Required = false,
};
var bpmOption = new Option<int?>("--bpm")
{
    Description = "Optional BPM of the audio",
    Required = false,
};
var keyOption = new Option<string?>("--key")
{
    Description = "Optional musical key of the audio (e.g. 'C min', 'F# Maj')",
    Required = false,
};
var streamOption = new Option<FileInfo?>("--stream", "-s")
{
    Description = "Optional local streaming preview audio file (e.g. .mp3)",
    Required = false,
};

var create = new Command("create", "Create a playable audio row (upload then insert)");
create.Options.Add(fileOption);
create.Options.Add(streamOption);
create.Options.Add(titleOption);
create.Options.Add(publishedOption);
create.Options.Add(coverOption);
create.Options.Add(bpmOption);
create.Options.Add(keyOption);
create.SetAction(async (parseResult, ct) =>
{
    var publishedRaw = parseResult.GetValue(publishedOption);
    if (publishedRaw is not ("true" or "false"))
    {
        await Console.Error.WriteLineAsync("--published must be true or false");
        return 1;
    }

    var uploadUrl = Environment.GetEnvironmentVariable("UPLOAD_API_URL");
    var secret = Environment.GetEnvironmentVariable("ADMIN_SECRET");
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(uploadUrl) || string.IsNullOrWhiteSpace(secret))
    {
        await Console.Error.WriteLineAsync("UPLOAD_API_URL and ADMIN_SECRET are required");
        return 1;
    }
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }

    var bpm = parseResult.GetValue(bpmOption);
    var key = parseResult.GetValue(keyOption);
    var stream = parseResult.GetValue(streamOption);

    using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
    return await CreatePlayableAudio.RunAsync(
        http,
        uploadUrl,
        secret,
        parseResult.GetValue(fileOption)!,
        parseResult.GetValue(titleOption)!,
        publishedRaw == "true",
        parseResult.GetValue(coverOption),
        (title, published, streamUrl, downloadUrl, coverUrl, b, k) =>
            InsertPlayableAudioRow.RunAsync(databaseUrl, title, published, streamUrl, downloadUrl, coverUrl, b, k),
        Console.Out,
        Console.Error,
        bpm,
        key,
        stream);
});

root.Subcommands.Add(create);

var listCommand = new Command("list", "List playable audio");
listCommand.SetAction(async (parseResult, ct) =>
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }
    return await ListPlayableAudio.RunAsync(databaseUrl);
});
root.Subcommands.Add(listCommand);

var updateCommand = new Command("update", "Update playable audio");
var updateIdOption = new Option<int>("--id") { Required = true, Description = "ID of the audio to update" };
var updateTitleOption = new Option<string?>("--title") { Description = "New title for the audio" };
var updatePublishedOption = new Option<bool?>("--published") { Description = "New published status (true/false)" };
var updateBpmOption = new Option<int?>("--bpm") { Description = "New BPM of the audio" };
var updateKeyOption = new Option<string?>("--key") { Description = "New musical key of the audio" };
updateCommand.Options.Add(updateIdOption);
updateCommand.Options.Add(updateTitleOption);
updateCommand.Options.Add(updatePublishedOption);
updateCommand.Options.Add(updateBpmOption);
updateCommand.Options.Add(updateKeyOption);
updateCommand.SetAction(async (parseResult, ct) =>
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }
    var id = parseResult.GetValue(updateIdOption);
    var title = parseResult.GetValue(updateTitleOption);
    var published = parseResult.GetValue(updatePublishedOption);
    var bpm = parseResult.GetValue(updateBpmOption);
    var key = parseResult.GetValue(updateKeyOption);
    return await UpdatePlayableAudio.RunAsync(databaseUrl, id, title, published, bpm, key);
});
root.Subcommands.Add(updateCommand);

var deleteCommand = new Command("delete", "Delete playable audio");
var deleteIdOption = new Option<int>("--id") { Required = true, Description = "ID of the audio to delete" };
var forceOption = new Option<bool>("--force") { Description = "Force delete including S3 files" };
deleteCommand.Options.Add(deleteIdOption);
deleteCommand.Options.Add(forceOption);
deleteCommand.SetAction(async (parseResult, ct) =>
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }
    var id = parseResult.GetValue(deleteIdOption);
    var force = parseResult.GetValue(forceOption);
    return await DeletePlayableAudio.RunAsync(databaseUrl, id, force);
});
root.Subcommands.Add(deleteCommand);

var analyticsCommand = new Command("analytics", "View analytics");
var analyticsIdOption = new Option<int?>("--id") { Description = "Optional ID of the audio to view specific analytics" };
analyticsCommand.Options.Add(analyticsIdOption);
analyticsCommand.SetAction(async (parseResult, ct) =>
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }
    var id = parseResult.GetValue(analyticsIdOption);
    return await AnalyticsCommand.RunAsync(databaseUrl, id);
});
root.Subcommands.Add(analyticsCommand);

return await root.Parse(args).InvokeAsync();
