package main

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"
)

type Activity struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Details   string `json:"details,omitempty"`
	IP        string `json:"ip,omitempty"`
	IPCity    string `json:"ipCity,omitempty"`
}

func clientIPFromRequest(r *http.Request) string {
	if r == nil {
		return "系统"
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host := strings.TrimSpace(r.RemoteAddr)
	if strings.Contains(host, ":") {
		if parsedHost, _, err := net.SplitHostPort(host); err == nil {
			return parsedHost
		}
	}
	if host == "" {
		return "未知 IP"
	}
	return host
}

func ipCityLabel(ip string) string {
	ip = strings.TrimSpace(strings.ToLower(ip))
	if ip == "" || ip == "系统" || ip == "未知 ip" {
		return "系统"
	}
	if ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "172.") {
		return "本地/局域网"
	}
	return "未知城市"
}

func addActivity(action, details string) {
	state.Activities = append([]Activity{{Timestamp: currentTimestamp(), Action: action, Details: details, IP: "系统", IPCity: "系统"}}, state.Activities...)
}

func addActivityWithRequest(r *http.Request, action, details string) {
	ip := clientIPFromRequest(r)
	state.Activities = append([]Activity{{Timestamp: currentTimestamp(), Action: action, Details: details, IP: ip, IPCity: ipCityLabel(ip)}}, state.Activities...)
}

func pruneOldActivitiesUnsafe() int {
	cutoff := time.Now().AddDate(0, 0, -activityRetentionDays)
	kept := make([]Activity, 0, len(state.Activities))
	removed := 0
	for _, activity := range state.Activities {
		t, err := time.Parse("2006-01-02 15:04:05", activity.Timestamp)
		if err != nil {
			kept = append(kept, activity)
			continue
		}
		if t.Before(cutoff) {
			removed++
			continue
		}
		kept = append(kept, activity)
	}
	if removed > 0 {
		state.Activities = kept
	}
	return removed
}

func activitiesHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	removed := pruneOldActivitiesUnsafe()
	if removed > 0 {
		_ = saveStore()
	}
	activities := append([]Activity(nil), state.Activities...)
	mu.Unlock()
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"activities":     activities,
		"retentionDays":  activityRetentionDays,
		"cleanupApplied": removed > 0,
		"cleanupRemoved": removed,
	})
}
