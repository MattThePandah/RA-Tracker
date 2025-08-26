using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Get the console argument from the command (e.g., !console ps1)
            CPH.TryGetArg("rawInput", out string rawInput);
            string[] parts = (rawInput ?? "").Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            
            string targetConsole = "";
            if (parts.Length > 1)
            {
                string input = parts[1].ToLower();
                targetConsole = input switch {
                    "ps1" => "PlayStation",
                    "ps2" => "PlayStation 2", 
                    "psp" => "PlayStation Portable",
                    "playstation" => "PlayStation",
                    "playstation2" => "PlayStation 2",
                    "playstationportable" => "PlayStation Portable",
                    _ => ""
                };
            }
            
            // If no valid console specified, show available options
            if (string.IsNullOrEmpty(targetConsole))
            {
                CPH.SendMessage("Usage: !console [ps1/ps2/psp] - Shows stats for a specific PlayStation console.", true);
                return true;
            }
            
            // Path to the games.json file
            string gamesFilePath = @"D:\Development\Streaming\Game Info Grabber\games.json";
            
            if (!File.Exists(gamesFilePath))
            {
                CPH.SendMessage("Games database not found!", true);
                return false;
            }
            
            // Read and parse games.json
            string jsonContent = File.ReadAllText(gamesFilePath);
            JArray games = JArray.Parse(jsonContent);
            
            // Filter games for the target console
            var consoleGames = games.Where(g => g["console"]?.ToString() == targetConsole).ToList();
            
            if (!consoleGames.Any())
            {
                CPH.SendMessage($"No games found for {targetConsole}!", true);
                return true;
            }
            
            // Calculate console statistics
            int totalGames = consoleGames.Count;
            int completedGames = consoleGames.Count(g => g["status"]?.ToString() == "Completed");
            int startedGames = consoleGames.Count(g => g["status"]?.ToString() == "In Progress" || g["status"]?.ToString() == "Started");
            int notStartedGames = consoleGames.Count(g => g["status"]?.ToString() == "Not Started");
            
            // Calculate completion percentage
            double completionPercentage = totalGames > 0 ? (double)completedGames / totalGames * 100 : 0;
            
            // Get console shorthand for display
            string shortConsole = targetConsole switch {
                "PlayStation" => "PS1",
                "PlayStation 2" => "PS2",
                "PlayStation Portable" => "PSP",
                _ => targetConsole
            };
            
            // Build message
            string message = $"{shortConsole} Progress: {completedGames}/{totalGames} completed ({completionPercentage:F1}%)";
            
            if (startedGames > 0)
            {
                message += $" | {startedGames} in progress";
            }
            
            if (completedGames > 0)
            {
                // Find a recent completed game for this console
                var recentCompleted = consoleGames
                    .Where(g => g["status"]?.ToString() == "Completed")
                    .OrderByDescending(g => {
                        string dateStr = g["date_finished"]?.ToString();
                        if (DateTime.TryParse(dateStr, out DateTime date))
                            return date;
                        return DateTime.MinValue;
                    })
                    .FirstOrDefault();
                
                if (recentCompleted != null)
                {
                    string recentTitle = recentCompleted["title"]?.ToString() ?? "Unknown Game";
                    message += $" | Recent: {recentTitle}";
                }
            }
            else
            {
                message += $" | Ready to start the {shortConsole} journey!";
            }
            
            CPH.SendMessage(message, true);
            return true;
        }
        catch (FileNotFoundException)
        {
            CPH.SendMessage("Games database not found! Make sure the Game Info Grabber is set up correctly.", true);
            return false;
        }
        catch (JsonException ex)
        {
            CPH.SendMessage("Error reading games database.", true);
            CPH.LogError($"ConsoleStatsCommand JSON Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving console statistics.", true);
            CPH.LogError($"ConsoleStatsCommand Error: {ex.Message}");
            return false;
        }
    }
}