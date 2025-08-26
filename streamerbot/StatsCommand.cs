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
            
            // Calculate statistics
            int totalGames = games.Count;
            int completedGames = games.Count(g => g["status"]?.ToString() == "Completed");
            int startedGames = games.Count(g => g["status"]?.ToString() == "In Progress" || g["status"]?.ToString() == "Started");
            int notStartedGames = games.Count(g => g["status"]?.ToString() == "Not Started");
            
            // Calculate completion percentage
            double completionPercentage = totalGames > 0 ? (double)completedGames / totalGames * 100 : 0;
            
            // Find most played console (by completed games)
            var consoleStats = games
                .Where(g => g["status"]?.ToString() == "Completed")
                .GroupBy(g => g["console"]?.ToString() ?? "Unknown")
                .OrderByDescending(group => group.Count())
                .FirstOrDefault();
            
            string favoriteConsole = consoleStats?.Key ?? "None yet";
            int favoriteConsoleCount = consoleStats?.Count() ?? 0;
            
            // Shorten console name for display
            string shortConsole = favoriteConsole switch {
                "PlayStation" => "PS1",
                "PlayStation 2" => "PS2",
                "PlayStation Portable" => "PSP",
                _ => favoriteConsole
            };
            
            // Build stats message
            string message = $"PSFest Progress: {completedGames}/{totalGames} completed ({completionPercentage:F1}%)";
            
            if (startedGames > 0)
            {
                message += $" | {startedGames} in progress";
            }
            
            if (completedGames > 0)
            {
                message += $" | Top console: {shortConsole} ({favoriteConsoleCount} completed)";
            }
            else
            {
                message += " | The adventure begins!";
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
            CPH.LogError($"StatsCommand JSON Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving PSFest statistics.", true);
            CPH.LogError($"StatsCommand Error: {ex.Message}");
            return false;
        }
    }
}