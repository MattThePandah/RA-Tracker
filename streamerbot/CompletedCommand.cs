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
            
            // Filter completed games and sort by completion date (most recent first)
            var completedGames = games
                .Where(g => g["status"]?.ToString() == "Completed")
                .OrderByDescending(g => {
                    string dateStr = g["date_finished"]?.ToString();
                    if (DateTime.TryParse(dateStr, out DateTime date))
                        return date;
                    return DateTime.MinValue;
                })
                .Take(5) // Show last 5 completed games
                .ToList();
            
            if (!completedGames.Any())
            {
                CPH.SendMessage("No games completed yet in PSFest! The journey continues...", true);
                return true;
            }
            
            // Build message with recently completed games
            string message = $"Recently completed games ({completedGames.Count}): ";
            var gameNames = completedGames.Select(g => {
                string title = g["title"]?.ToString() ?? "Unknown Game";
                string console = g["console"]?.ToString() ?? "";
                
                // Shorten console names for chat
                string shortConsole = console switch {
                    "PlayStation" => "PS1",
                    "PlayStation 2" => "PS2", 
                    "PlayStation Portable" => "PSP",
                    _ => console
                };
                
                return string.IsNullOrEmpty(shortConsole) ? title : $"{title} ({shortConsole})";
            });
            
            message += string.Join(", ", gameNames);
            
            // Add total completion count
            int totalCompleted = games.Count(g => g["status"]?.ToString() == "Completed");
            message += $" | Total: {totalCompleted}/1841 completed";
            
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
            CPH.LogError($"CompletedCommand JSON Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving completed games information.", true);
            CPH.LogError($"CompletedCommand Error: {ex.Message}");
            return false;
        }
    }
}