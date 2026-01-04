using System;                                                                                                                                                         
  using System.Net;                                                                                                                                                     
  using System.Text;                                                                                                                                                    
  using Newtonsoft.Json.Linq;                                                                                                                                           
                                                                                                                                                                        
  public class CPHInline                                                                                                                                                
  {                                                                                                                                                                     
      public bool Execute()                                                                                                                                             
      {                                                                                                                                                                 
          try                                                                                                                                                           
          {                                                                                                                                                             
              string apiBaseUrl = "http://localhost:8787";                                                                                                              
              string apiKey = "7decb57e91c47776013fedd65a0caf749a33147a12dd4de254575567c9e479d9";  
              string GetStringArg(params string[] names)
              {
                  foreach (var name in names)
                  {
                      if (string.IsNullOrWhiteSpace(name)) continue;
                      if (CPH.TryGetArg(name, out object value) && value != null)
                      {
                          var text = value.ToString();
                          if (!string.IsNullOrWhiteSpace(text)) return text;
                      }
                  }
                  return string.Empty;
              }

              int GetIntArg(params string[] names)
              {
                  foreach (var name in names)
                  {
                      if (string.IsNullOrWhiteSpace(name)) continue;
                      if (CPH.TryGetArg(name, out object value) && value != null)
                      {
                          if (value is int i) return i;
                          if (int.TryParse(value.ToString(), out var parsed)) return parsed;
                      }
                  }
                  return 0;
              }

              bool GetBoolArg(params string[] names)
              {
                  foreach (var name in names)
                  {
                      if (string.IsNullOrWhiteSpace(name)) continue;
                      if (CPH.TryGetArg(name, out object value) && value != null)
                      {
                          if (value is bool b) return b;
                          if (bool.TryParse(value.ToString(), out var parsed)) return parsed;
                          if (int.TryParse(value.ToString(), out var num)) return num != 0;
                      }
                  }
                  return false;
              }

              string NormalizeTierText(string raw)
              {
                  if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
                  var trimmed = raw.Trim();
                  var lower = trimmed.ToLowerInvariant();
                  if (lower == "prime") return "Prime";
                  if (lower == "tier1" || lower == "tier 1" || lower == "t1" || lower == "1000") return "Tier 1";
                  if (lower == "tier2" || lower == "tier 2" || lower == "t2" || lower == "2000") return "Tier 2";
                  if (lower == "tier3" || lower == "tier 3" || lower == "t3" || lower == "3000") return "Tier 3";
                  return trimmed;
              }

              string userName = GetStringArg("userName", "user", "displayName");
              string triggerName = GetStringArg("triggerName");
              string eventType = GetStringArg("eventType", "overlayType");
              string eventLabel = GetStringArg("eventLabel", "overlayLabel");
              string triggerNameLower = (triggerName ?? string.Empty).ToLowerInvariant();
              if (string.IsNullOrWhiteSpace(eventType))
              {
                  if (triggerNameLower.Contains("resub")) eventType = "resub";
                  else if (triggerNameLower.Contains("gift") || triggerNameLower.Contains("pay it forward")) eventType = "gift";
                  else eventType = "sub";
              }
              if (string.IsNullOrWhiteSpace(eventLabel) && !string.IsNullOrWhiteSpace(triggerName)) eventLabel = triggerName;

              int cumulativeMonths = GetIntArg(
                  "cumulative",
                  "cumulativeMonths",
                  "totalMonths",
                  "monthsSubscribed",
                  "multiMonthTenure"
              );
              int streakMonths = GetIntArg(
                  "monthStreak",
                  "streakMonths",
                  "streakShared"
              );
              bool isMultiMonth = GetBoolArg("isMultiMonth");
              int multiMonthDuration = GetIntArg("multiMonthDuration");
              int months = cumulativeMonths > 0
                  ? cumulativeMonths
                  : (isMultiMonth && multiMonthDuration > 0
                      ? multiMonthDuration
                      : (streakMonths > 0 ? streakMonths : 0));

              int subscriptionTier = GetIntArg("subscriptionTier", "subTier", "tier", "tierLevel");
              bool isPrime = GetBoolArg("isPrime", "prime");
              string tierRaw = GetStringArg("tierName", "subscriptionTierName", "subPlanName", "subPlan", "tier", "subscriptionTier");
              string tier = NormalizeTierText(tierRaw);
              if (string.IsNullOrWhiteSpace(tier))
              {
                  if (isPrime) tier = "Prime";
                  else if (subscriptionTier >= 3000) tier = "Tier 3";
                  else if (subscriptionTier >= 2000) tier = "Tier 2";
                  else if (subscriptionTier >= 1000) tier = "Tier 1";
              }

              bool isAnonymous = GetBoolArg("anonymous");
              if (isAnonymous) userName = "Anonymous";
              int giftCount = GetIntArg("giftCount", "totalGiftCount", "totalGifts", "gifts", "count");
              int bonusGifts = GetIntArg("bonusGifts");
              int totalGiftsShared = GetIntArg("totalGiftsShared");
              bool isGiftBomb = triggerNameLower.Contains("gift bomb")
                  || bonusGifts > 0
                  || totalGiftsShared > 0;
              if (isGiftBomb)
              {
                  eventType = "gift";
                  if (string.IsNullOrWhiteSpace(eventLabel)) eventLabel = "Gift Bomb";
                  if (giftCount <= 0) giftCount = GetIntArg("totalGifts", "gifts");
                  if (giftCount <= 0 && totalGiftsShared > 0) giftCount = totalGiftsShared;
              }
              string gifter = GetStringArg("gifterUserName", "gifterUser", "gifterName");
              string recipient = GetStringArg(
                  "recipientUserName",
                  "recipientUsername",
                  "recipientUser",
                  "recipientName",
                  "recipient",
                  "recipientUserName0",
                  "recipientUser0",
                  "gift.recipientUserName0",
                  "gift.recipientUser0"
              );
              string gifterName = !string.IsNullOrWhiteSpace(gifter) ? gifter : userName;
              int giftMonths = GetIntArg("monthsGifted", "giftMonths", "giftedMonths", "months");
              bool isGiftSubscription = !isGiftBomb
                  && eventType == "gift"
                  && (!string.IsNullOrWhiteSpace(recipient) || triggerNameLower.Contains("gift subscription"));

              string message = GetStringArg("message", "subMessage", "systemMessage");
              if (string.IsNullOrWhiteSpace(message) || isGiftSubscription)
              {
                  if (eventType == "gift")
                  {
                      string tierSuffix = string.IsNullOrWhiteSpace(tier) ? string.Empty : $" ({tier})";
                      if (isGiftBomb)
                      {
                          if (giftCount > 0 && bonusGifts > 0) message = $"Gift Bomb {giftCount} (+{bonusGifts} bonus){tierSuffix}";
                          else if (giftCount > 0) message = $"Gift Bomb {giftCount}{tierSuffix}";
                          else message = $"Gift Bomb{tierSuffix}";
                      }
                      else if (isGiftSubscription && !string.IsNullOrWhiteSpace(recipient))
                      {
                          message = $"To {recipient}";
                      }
                      else if (giftCount > 0) message = $"Gifted {giftCount} subs{tierSuffix}";
                      else if (!string.IsNullOrWhiteSpace(recipient)) message = $"Gifted to {recipient}{tierSuffix}";
                      else message = $"Gift sub{tierSuffix}";
                  }
                  else if (eventType == "resub")
                  {
                      if (isMultiMonth && multiMonthDuration > 0 && cumulativeMonths > 0)
                      {
                          message = $"Resub {cumulativeMonths} months (x{multiMonthDuration})";
                      }
                      else if (months > 0)
                      {
                          message = $"Resub {months} months";
                      }
                      else
                      {
                          message = "Resub";
                      }
                  }
                  else
                  {
                      message = months > 0 ? $"Thanks for {months} months" : "Thanks for the sub";
                  }
              }
                                                                                                                                                                        
              var payload = new JObject                                                                                                                                 
              {                                                                                                                                                         
                  ["platform"] = "twitch",                                                                                                                              
                  ["type"] = eventType,                                                                                                                                     
                  ["user"] = userName,                                                                                                                                
                  ["message"] = message,                                                                                                               
                  ["durationMs"] = 12000                                                                                                                                
              };                                                                                                                                                        
              if (!string.IsNullOrWhiteSpace(tier)) payload["tier"] = tier;
              if (months > 0) payload["months"] = months;
              if (giftCount > 0) payload["count"] = giftCount;
                                                                                                                                                                        
              using (WebClient client = new WebClient())                                                                                                                
              {                                                                                                                                                         
                  client.Encoding = Encoding.UTF8;                                                                                                                      
                  client.Headers[HttpRequestHeader.ContentType] = "application/json";                                                                                   
                  client.Headers["x-streamerbot-key"] = apiKey;                                                                                                         
                  client.UploadString($"{apiBaseUrl}/api/streamerbot/overlay-connector", payload.ToString());                                                           
              }                                                                                                                                                         
                                                                                                                                                                        
              return true;                                                                                                                                              
          }                                                                                                                                                             
          catch (Exception ex)                                                                                                                                          
          {                                                                                                                                                             
              CPH.LogError($"Overlay Connector POST failed: {ex.Message}");                                                                                             
              return false;                                                                                                                                             
          }                                                                                                                                                             
      }                                                                                                                                                                 
  }                              
