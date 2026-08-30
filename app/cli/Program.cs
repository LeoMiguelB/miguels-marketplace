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

var create = new Command("create", "Create a playable audio row (upload then insert)");
create.Options.Add(fileOption);
create.Options.Add(titleOption);
create.Options.Add(publishedOption);
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
    if (string.IsNullOrWhiteSpace(uploadUrl) || string.IsNullOrWhiteSpace(secret))
    {
        await Console.Error.WriteLineAsync("UPLOAD_API_URL and ADMIN_SECRET are required");
        return 1;
    }

    using var http = new HttpClient();
    return await CreatePlayableAudio.RunAsync(
        http,
        uploadUrl,
        secret,
        parseResult.GetValue(fileOption)!,
        parseResult.GetValue(titleOption)!,
        publishedRaw == "true",
        Console.Out,
        Console.Error);
});

root.Subcommands.Add(create);
root.Subcommands.Add(NotImplementedCommand("list", "List playable audio"));
root.Subcommands.Add(NotImplementedCommand("update", "Update playable audio"));
root.Subcommands.Add(NotImplementedCommand("delete", "Delete playable audio"));
root.Subcommands.Add(NotImplementedCommand("analytics", "View analytics"));

return await root.Parse(args).InvokeAsync();

static Command NotImplementedCommand(string name, string description)
{
    var command = new Command(name, description);
    command.SetAction(async (_, _) =>
    {
        await Console.Error.WriteLineAsync("not implemented");
        return 1;
    });
    return command;
}
