package main

import (
	"archive/zip"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	defaultCleanupMinutes = 60
	activityRetentionDays = 183
	defaultServerPort     = "8081"
	publicPrefix          = "/uploads/"
)

type User struct {
	ID            int    `json:"id"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	Password      string `json:"password,omitempty"`
	Role          string `json:"role,omitempty"`
	Status        string `json:"status,omitempty"`
	LastLogin     string `json:"lastLogin,omitempty"`
	Bio           string `json:"bio,omitempty"`
	UploadCount   int    `json:"uploadCount,omitempty"`
	TeamCount     int    `json:"teamCount,omitempty"`
	DisplayName   string `json:"displayName,omitempty"`
	AvatarDataURL string `json:"avatarDataUrl,omitempty"`
	AvatarURL     string `json:"avatarUrl,omitempty"`
}

type Activity struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Details   string `json:"details,omitempty"`
	IP        string `json:"ip,omitempty"`
	IPCity    string `json:"ipCity,omitempty"`
}

type TeamMember struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Status   string `json:"status,omitempty"`
}

type Folder struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ImageItem struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	OriginalName string   `json:"originalName"`
	Filename     string   `json:"filename"`
	URL          string   `json:"url"`
	FolderID     string   `json:"folderId"`
	Description  string   `json:"description,omitempty"`
	Tags         []string `json:"tags,omitempty"`
	UploadedAt   string   `json:"uploadedAt"`
	Size         int64    `json:"size"`
}

type TrashImageItem struct {
	ImageItem
	DeletedAt   string `json:"deletedAt"`
	OriginalURL string `json:"originalUrl"`
}

type TrashFolderItem struct {
	Folder
	DeletedAt       string `json:"deletedAt"`
	ContainedImages int    `json:"containedImages"`
}

type TrashConfig struct {
	CleanupIntervalMinutes int `json:"cleanupIntervalMinutes"`
}

type safeUser struct {
	ID            int    `json:"id"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	Role          string `json:"role,omitempty"`
	Status        string `json:"status,omitempty"`
	LastLogin     string `json:"lastLogin,omitempty"`
	Bio           string `json:"bio,omitempty"`
	UploadCount   int    `json:"uploadCount,omitempty"`
	TeamCount     int    `json:"teamCount,omitempty"`
	DisplayName   string `json:"displayName,omitempty"`
	AvatarDataURL string `json:"avatarDataUrl,omitempty"`
	AvatarURL     string `json:"avatarUrl,omitempty"`
}

type store struct {
	Users        []User            `json:"users"`
	Activities   []Activity        `json:"activities"`
	Team         []TeamMember      `json:"team"`
	Folders      []Folder          `json:"folders"`
	Images       []ImageItem       `json:"images"`
	TrashImages  []TrashImageItem  `json:"trashImages"`
	TrashFolders []TrashFolderItem `json:"trashFolders"`
	TrashConfig  TrashConfig       `json:"trashConfig"`
	ActiveUserID int               `json:"activeUserID"`
}

//go:embed page/*
var embeddedFrontend embed.FS

var (
	state           = store{}
	mu              sync.Mutex
	storePath       string
	uploadsDir      string
	trashUploadsDir string
)

func currentTimestamp() string { return time.Now().Format("2006-01-02 15:04:05") }
func imageID() string          { return strconv.FormatInt(time.Now().UnixNano(), 10) }

func initPaths() {
	execPath, err := os.Executable()
	if err != nil {
		storePath = filepath.Join("data", "store.json")
		uploadsDir = filepath.Join("data", "uploads")
		trashUploadsDir = filepath.Join("data", "trash_uploads")
		return
	}
	baseDir := filepath.Dir(execPath)
	storePath = filepath.Join(baseDir, "data", "store.json")
	uploadsDir = filepath.Join(baseDir, "data", "uploads")
	trashUploadsDir = filepath.Join(baseDir, "data", "trash_uploads")
}

func toSafeUser(user User) safeUser {
	return safeUser{ID: user.ID, Email: user.Email, Username: user.Username, Role: user.Role, Status: user.Status, LastLogin: user.LastLogin, Bio: user.Bio, UploadCount: user.UploadCount, TeamCount: user.TeamCount, DisplayName: user.DisplayName, AvatarDataURL: user.AvatarDataURL, AvatarURL: user.AvatarURL}
}

func hashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func comparePassword(hashedPassword, plainPassword string) bool {
	if strings.HasPrefix(hashedPassword, "$2") {
		return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword)) == nil
	}
	return hashedPassword == plainPassword
}

func sizeLabel(size int64) string {
	if size >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(size)/1024.0/1024.0)
	}
	return fmt.Sprintf("%d KB", (size+1023)/1024)
}

func folderNameByID(id string) string {
	if id == "" || id == "all-assets" {
		return "未分类"
	}
	for _, folder := range state.Folders {
		if folder.ID == id {
			if folder.ID == "all-assets" {
				return "未分类"
			}
			return folder.Name
		}
	}
	for _, folder := range state.TrashFolders {
		if folder.ID == id {
			if folder.ID == "all-assets" {
				return "未分类"
			}
			return folder.Name
		}
	}
	return "未分类"
}

func folderImageCount(folderID string) int {
	count := 0
	for _, image := range state.Images {
		if image.FolderID == folderID {
			count++
		}
	}
	return count
}

func ensureSeedData() error {
	if len(state.Users) == 0 {
		password, err := hashPassword("123456")
		if err != nil {
			return err
		}
		state.Users = []User{{ID: 1, Email: "demo@example.com", Username: "demo_user", Password: password, Role: "admin", Status: "active", LastLogin: currentTimestamp(), Bio: "欢迎加入 Image Management，开始你的图像资产管理。", UploadCount: 0, TeamCount: 2, DisplayName: "Demo User / 演示用户"}}
		state.ActiveUserID = 1
	}
	if len(state.Team) == 0 {
		state.Team = []TeamMember{{Username: "Olivia", Email: "olivia@example.com", Role: "admin", Status: "管理员"}, {Username: "Ethan", Email: "ethan@example.com", Role: "user", Status: "普通成员"}}
	}
	if len(state.Folders) == 0 {
		state.Folders = []Folder{{ID: "all-assets", Name: "未分类"}, {ID: "marketing", Name: "营销海报"}, {ID: "product", Name: "产品图片"}}
	}
	if len(state.Activities) == 0 {
		state.Activities = []Activity{{Timestamp: currentTimestamp(), Action: "更新资料", Details: "修改了用户信息与头像设置"}, {Timestamp: currentTimestamp(), Action: "上传素材", Details: "上传图片 banner_mock_01.png"}, {Timestamp: currentTimestamp(), Action: "团队协作", Details: "完成 2 位成员的权限调整"}}
	}
	if state.TrashConfig.CleanupIntervalMinutes <= 0 {
		state.TrashConfig.CleanupIntervalMinutes = defaultCleanupMinutes
	}
	for i := range state.Users {
		state.Users[i].TeamCount = len(state.Team)
		state.Users[i].UploadCount = len(state.Images)
		if state.Users[i].DisplayName == "" {
			state.Users[i].DisplayName = state.Users[i].Username
		}
		if state.Users[i].Role == "" {
			state.Users[i].Role = "user"
		}
		if state.Users[i].Status == "" {
			state.Users[i].Status = "active"
		}
		if state.Users[i].Bio == "" {
			state.Users[i].Bio = "欢迎加入 Image Management，开始你的图像资产管理。"
		}
		if !strings.HasPrefix(state.Users[i].Password, "$2") {
			password, err := hashPassword(state.Users[i].Password)
			if err != nil {
				return err
			}
			state.Users[i].Password = password
		}
	}
	for i := range state.Folders {
		if state.Folders[i].ID == "all-assets" {
			state.Folders[i].Name = "未分类"
		}
	}
	for i := range state.TrashFolders {
		if state.TrashFolders[i].ID == "all-assets" {
			state.TrashFolders[i].Name = "未分类"
		}
	}
	pruneOldActivitiesUnsafe()
	return nil
}

func saveStore() error {
	if err := os.MkdirAll(filepath.Dir(storePath), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := storePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmpPath, storePath)
}

func loadStore() error {
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(trashUploadsDir, 0o755); err != nil {
		return err
	}
	data, err := os.ReadFile(storePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			state = store{}
			if err := ensureSeedData(); err != nil {
				return err
			}
			return saveStore()
		}
		return err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}
	if err := ensureSeedData(); err != nil {
		return err
	}
	return saveStore()
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

func currentUserUnsafe() User {
	if len(state.Users) == 0 {
		return User{}
	}
	currentUser := state.Users[len(state.Users)-1]
	if state.ActiveUserID != 0 {
		for _, user := range state.Users {
			if user.ID == state.ActiveUserID {
				currentUser = user
				break
			}
		}
	}
	currentUser.TeamCount = len(state.Team)
	currentUser.UploadCount = len(state.Images)
	return currentUser
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

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": msg})
}

func moveFileToTrash(filename string) {
	if filename == "" {
		return
	}
	src := filepath.Join(uploadsDir, filename)
	dst := filepath.Join(trashUploadsDir, filename)
	if _, err := os.Stat(src); err == nil {
		_ = os.Rename(src, dst)
	}
}

func restoreFileFromTrash(filename string) {
	if filename == "" {
		return
	}
	src := filepath.Join(trashUploadsDir, filename)
	dst := filepath.Join(uploadsDir, filename)
	if _, err := os.Stat(src); err == nil {
		_ = os.Rename(src, dst)
	}
}

func permanentlyDeleteTrashAssetsUnsafe() {
	for _, image := range state.TrashImages {
		_ = os.Remove(filepath.Join(trashUploadsDir, image.Filename))
	}
	state.TrashImages = nil
	state.TrashFolders = nil
}

func cleanupTrashUnsafe() {
	if len(state.TrashImages) == 0 && len(state.TrashFolders) == 0 {
		return
	}
	permanentlyDeleteTrashAssetsUnsafe()
	addActivity("清空回收站", "系统按清理周期自动清空回收站")
	_ = saveStore()
}

func startTrashCleanupWorker() {
	go func() {
		for {
			interval := defaultCleanupMinutes
			mu.Lock()
			if state.TrashConfig.CleanupIntervalMinutes > 0 {
				interval = state.TrashConfig.CleanupIntervalMinutes
			}
			mu.Unlock()
			time.Sleep(time.Duration(interval) * time.Minute)
			mu.Lock()
			cleanupTrashUnsafe()
			mu.Unlock()
		}
	}()
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var newUser User
	if err := decodeJSON(r, &newUser); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if strings.TrimSpace(newUser.Email) == "" || strings.TrimSpace(newUser.Username) == "" || strings.TrimSpace(newUser.Password) == "" {
		jsonError(w, http.StatusBadRequest, "请完整填写邮箱、用户名和密码")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for _, user := range state.Users {
		if user.Email == newUser.Email {
			jsonError(w, http.StatusBadRequest, "邮箱已被注册")
			return
		}
	}
	hashedPassword, err := hashPassword(newUser.Password)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "密码处理失败")
		return
	}
	newUser.ID = len(state.Users) + 1
	newUser.Password = hashedPassword
	newUser.Role = "user"
	newUser.Status = "active"
	newUser.LastLogin = currentTimestamp()
	newUser.Bio = "欢迎加入 Image Management，开始你的图像资产管理。"
	newUser.UploadCount = len(state.Images)
	newUser.TeamCount = len(state.Team)
	newUser.DisplayName = newUser.Username
	state.Users = append(state.Users, newUser)
	state.ActiveUserID = newUser.ID
	addActivityWithRequest(r, "创建账号", fmt.Sprintf("用户 %s 完成注册", newUser.Username))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "注册数据保存失败")
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"message": "注册成功，请登录", "user": toSafeUser(newUser)})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var creds struct {
		Identifier string `json:"identifier"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if err := decodeJSON(r, &creds); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	identifier := strings.TrimSpace(creds.Identifier)
	if identifier == "" {
		identifier = strings.TrimSpace(creds.Email)
	}
	mu.Lock()
	defer mu.Unlock()
	for i, user := range state.Users {
		if (user.Email == identifier || user.Username == identifier) && comparePassword(user.Password, creds.Password) {
			state.Users[i].LastLogin = currentTimestamp()
			state.Users[i].TeamCount = len(state.Team)
			state.Users[i].UploadCount = len(state.Images)
			state.ActiveUserID = user.ID
			if err := saveStore(); err != nil {
				jsonError(w, http.StatusInternalServerError, "登录状态保存失败")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": toSafeUser(state.Users[i]), "token": fmt.Sprintf("mock-token-%d", user.ID)})
			return
		}
	}
	jsonError(w, http.StatusUnauthorized, "用户名/邮箱或密码错误")
}

func dashboardHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	if len(state.Users) == 0 {
		jsonError(w, http.StatusNotFound, "暂无用户数据，请先注册")
		return
	}
	currentUser := currentUserUnsafe()
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": toSafeUser(currentUser), "activities": state.Activities, "stats": map[string]int{"uploads": currentUser.UploadCount, "teamMembers": len(state.Team)}})
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
		"activities": activities,
		"retentionDays": activityRetentionDays,
		"cleanupApplied": removed > 0,
		"cleanupRemoved": removed,
	})
}

func profileAvatarHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		jsonError(w, http.StatusBadRequest, "无法解析头像上传请求")
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "请选择要保存的头像")
		return
	}
	defer file.Close()

	mu.Lock()
	if len(state.Users) == 0 {
		mu.Unlock()
		jsonError(w, http.StatusNotFound, "未找到当前用户")
		return
	}
	currentIndex := len(state.Users) - 1
	if state.ActiveUserID != 0 {
		for i := range state.Users {
			if state.Users[i].ID == state.ActiveUserID {
				currentIndex = i
				break
			}
		}
	}
	user := state.Users[currentIndex]
	mu.Unlock()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("avatar-%d%s", user.ID, ext)
	fullpath := filepath.Join(uploadsDir, filename)
	out, err := os.Create(fullpath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "头像文件保存失败")
		return
	}
	if _, err := io.Copy(out, file); err != nil {
		out.Close()
		jsonError(w, http.StatusInternalServerError, "头像文件保存失败")
		return
	}
	out.Close()

	mu.Lock()
	defer mu.Unlock()
	state.Users[currentIndex].AvatarURL = publicPrefix + filename
	state.Users[currentIndex].AvatarDataURL = ""
	addActivityWithRequest(r, "更新头像", fmt.Sprintf("用户 %s 更新了头像", state.Users[currentIndex].Username))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "头像保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"message": "头像已保存", "user": toSafeUser(state.Users[currentIndex])})
}

func teamGetHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"members": state.Team, "logs": state.Activities})
}

func teamInviteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var invite struct{ Email, Role string }
	if err := decodeJSON(r, &invite); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if strings.TrimSpace(invite.Email) == "" {
		jsonError(w, http.StatusBadRequest, "请输入成员邮箱")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for _, member := range state.Team {
		if member.Email == invite.Email {
			jsonError(w, http.StatusBadRequest, "该成员已在团队中")
			return
		}
	}
	role := invite.Role
	if role != "admin" {
		role = "user"
	}
	username := strings.Split(invite.Email, "@")[0]
	if len(username) > 12 {
		username = username[:12]
	}
	newMember := TeamMember{Username: username, Email: invite.Email, Role: role, Status: map[bool]string{true: "管理员", false: "普通成员"}[role == "admin"]}
	state.Team = append(state.Team, newMember)
	for i := range state.Users {
		state.Users[i].TeamCount = len(state.Team)
	}
	addActivityWithRequest(r, "邀请成员", fmt.Sprintf("邀请 %s 加入团队", newMember.Username))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "邀请记录保存失败")
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "邀请成功"})
}

func foldersGetHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	type folderResp struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		ImageCount int    `json:"imageCount"`
	}
	resp := make([]folderResp, 0, len(state.Folders))
	for _, folder := range state.Folders {
		resp = append(resp, folderResp{ID: folder.ID, Name: folder.Name, ImageCount: folderImageCount(folder.ID)})
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"folders": resp})
}

func foldersPostHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var payload struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		jsonError(w, http.StatusBadRequest, "请输入文件夹名称")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for _, folder := range state.Folders {
		if folder.Name == name {
			jsonError(w, http.StatusBadRequest, "文件夹名称已存在")
			return
		}
	}
	id := strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	id = strings.ReplaceAll(id, "/", "-")
	if id == "" {
		id = imageID()
	}
	state.Folders = append(state.Folders, Folder{ID: id, Name: name})
	addActivityWithRequest(r, "新建文件夹", fmt.Sprintf("创建文件夹 %s", name))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "文件夹保存失败")
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "文件夹创建成功"})
}

func foldersDeleteHandler(w http.ResponseWriter, r *http.Request) {
	folderID := strings.TrimPrefix(r.URL.Path, "/api/folders/")
	if folderID == "" {
		jsonError(w, http.StatusBadRequest, "缺少文件夹 ID")
		return
	}
	if folderID == "all-assets" {
		jsonError(w, http.StatusBadRequest, "默认文件夹不允许删除")
		return
	}

	mu.Lock()
	defer mu.Unlock()
	folderIndex := -1
	for i, folder := range state.Folders {
		if folder.ID == folderID {
			folderIndex = i
			break
		}
	}
	if folderIndex == -1 {
		jsonError(w, http.StatusNotFound, "未找到文件夹")
		return
	}

	folder := state.Folders[folderIndex]
	imageCount := folderImageCount(folderID)
	state.TrashFolders = append(state.TrashFolders, TrashFolderItem{Folder: folder, DeletedAt: currentTimestamp(), ContainedImages: imageCount})
	state.Folders = append(state.Folders[:folderIndex], state.Folders[folderIndex+1:]...)
	addActivityWithRequest(r, "删除文件夹", fmt.Sprintf("删除文件夹 %s，并转入回收站", folder.Name))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "删除文件夹保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"message": "文件夹已移入回收站", "imageCount": imageCount})
}

func foldersRestoreHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID string `json:"id"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for i, folder := range state.TrashFolders {
		if folder.ID == payload.ID {
			state.Folders = append(state.Folders, folder.Folder)
			state.TrashFolders = append(state.TrashFolders[:i], state.TrashFolders[i+1:]...)
			addActivityWithRequest(r, "恢复文件夹", fmt.Sprintf("恢复文件夹 %s", folder.Name))
			_ = saveStore()
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "文件夹已恢复"})
			return
		}
	}
	jsonError(w, http.StatusNotFound, "未找到回收站中的文件夹")
}

func trashListHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	type trashImageResp struct {
		TrashImageItem
		FolderName string `json:"folderName"`
		SizeLabel  string `json:"sizeLabel"`
	}
	images := make([]trashImageResp, 0, len(state.TrashImages))
	for _, image := range state.TrashImages {
		images = append(images, trashImageResp{TrashImageItem: image, FolderName: folderNameByID(image.FolderID), SizeLabel: sizeLabel(image.Size)})
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"images":         images,
		"folders":        state.TrashFolders,
		"cleanupMinutes": state.TrashConfig.CleanupIntervalMinutes,
	})
}

func restoreTrashImageHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID string `json:"id"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for i, item := range state.TrashImages {
		if item.ID == payload.ID {
			restoreFileFromTrash(item.Filename)
			state.Images = append(state.Images, item.ImageItem)
			state.TrashImages = append(state.TrashImages[:i], state.TrashImages[i+1:]...)
			for u := range state.Users {
				state.Users[u].UploadCount = len(state.Images)
			}
			addActivityWithRequest(r, "恢复图片", fmt.Sprintf("恢复图片 %s", item.OriginalName))
			_ = saveStore()
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "图片已恢复"})
			return
		}
	}
	jsonError(w, http.StatusNotFound, "未找到回收站中的图片")
}

func trashConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var payload struct {
		CleanupIntervalMinutes int `json:"cleanupIntervalMinutes"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if payload.CleanupIntervalMinutes <= 0 {
		jsonError(w, http.StatusBadRequest, "清理周期必须大于 0 分钟")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	state.TrashConfig.CleanupIntervalMinutes = payload.CleanupIntervalMinutes
	addActivityWithRequest(r, "更新回收站配置", fmt.Sprintf("清理周期改为 %d 分钟", payload.CleanupIntervalMinutes))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "配置保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "回收站清理周期已更新"})
}

func trashClearHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	permanentlyDeleteTrashAssetsUnsafe()
	addActivityWithRequest(r, "清空回收站", "用户手动清空回收站")
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "清空回收站保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "回收站已清空"})
}

func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.ReplaceAll(name, "/", "-")
	if name == "" {
		name = "image"
	}
	return name
}

func zipName(name string) string {
	clean := sanitizeFilename(name)
	clean = strings.TrimSuffix(clean, filepath.Ext(clean))
	if clean == "" {
		clean = "images"
	}
	return clean + ".zip"
}

func streamImageDownload(w http.ResponseWriter, image ImageItem) {
	filePath := filepath.Join(uploadsDir, image.Filename)
	file, err := os.Open(filePath)
	if err != nil {
		jsonError(w, http.StatusNotFound, "图片文件不存在")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", sanitizeFilename(image.OriginalName)))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(image.Size, 10))
	_, _ = io.Copy(w, file)
}

func streamZipDownload(w http.ResponseWriter, zipFilename string, images []ImageItem) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", zipFilename))
	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	usedNames := map[string]int{}
	for _, image := range images {
		filePath := filepath.Join(uploadsDir, image.Filename)
		file, err := os.Open(filePath)
		if err != nil {
			continue
		}
		entryName := sanitizeFilename(image.OriginalName)
		if entryName == "image" {
			entryName = sanitizeFilename(image.Name)
		}
		if count := usedNames[entryName]; count > 0 {
			ext := filepath.Ext(entryName)
			base := strings.TrimSuffix(entryName, ext)
			entryName = fmt.Sprintf("%s-%d%s", base, count+1, ext)
		}
		usedNames[entryName]++
		entry, err := zipWriter.Create(entryName)
		if err != nil {
			file.Close()
			continue
		}
		_, _ = io.Copy(entry, file)
		file.Close()
	}
}

func saveUploadedFile(file multipart.File, header *multipart.FileHeader) (string, string, int64, error) {
	defer file.Close()
	id := imageID()
	ext := filepath.Ext(header.Filename)
	filename := id + ext
	fullpath := filepath.Join(uploadsDir, filename)
	out, err := os.Create(fullpath)
	if err != nil {
		return "", "", 0, err
	}
	defer out.Close()
	size, err := io.Copy(out, file)
	if err != nil {
		return "", "", 0, err
	}
	return filename, publicPrefix + filename, size, nil
}

func saveBase64Image(dataURL, preferredName string) (string, string, int64, error) {
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return "", "", 0, fmt.Errorf("invalid data url")
	}
	payload := parts[1]
	bytes, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", "", 0, err
	}
	filename := imageID() + ".png"
	fullpath := filepath.Join(uploadsDir, filename)
	if err := os.WriteFile(fullpath, bytes, 0o644); err != nil {
		return "", "", 0, err
	}
	return filename, publicPrefix + filename, int64(len(bytes)), nil
}

func imagesGetHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	type imageResp struct {
		ImageItem
		FolderName string `json:"folderName"`
		SizeLabel  string `json:"sizeLabel"`
	}
	resp := make([]imageResp, 0, len(state.Images))
	for _, img := range state.Images {
		resp = append(resp, imageResp{ImageItem: img, FolderName: folderNameByID(img.FolderID), SizeLabel: sizeLabel(img.Size)})
	}
	sort.Slice(resp, func(i, j int) bool { return resp[i].UploadedAt > resp[j].UploadedAt })
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"images": resp})
}

func imagesUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "application/json") {
		var payload struct {
			DataURL      string `json:"dataUrl"`
			Name         string `json:"name"`
			FolderID     string `json:"folderId"`
			Tags         string `json:"tags"`
			Description  string `json:"description"`
			OriginalName string `json:"originalName"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			jsonError(w, http.StatusBadRequest, "请求体格式错误")
			return
		}
		filename, url, size, err := saveBase64Image(payload.DataURL, payload.Name)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "保存编辑图片失败")
			return
		}
		folderID := payload.FolderID
		if folderID == "" {
			folderID = state.Folders[0].ID
		}
		tags := []string{}
		if strings.TrimSpace(payload.Tags) != "" {
			for _, tag := range strings.Split(payload.Tags, ",") {
				tag = strings.TrimSpace(tag)
				if tag != "" {
					tags = append(tags, tag)
				}
			}
		}
		mu.Lock()
		defer mu.Unlock()
		img := ImageItem{ID: imageID(), Name: sanitizeFilename(payload.Name), OriginalName: payload.OriginalName, Filename: filename, URL: url, FolderID: folderID, Description: payload.Description, Tags: tags, UploadedAt: currentTimestamp(), Size: size}
		state.Images = append(state.Images, img)
		for i := range state.Users {
			state.Users[i].UploadCount = len(state.Images)
		}
		addActivityWithRequest(r, "保存编辑副本", fmt.Sprintf("保存编辑后的图片 %s 到 %s", img.Name, folderNameByID(folderID)))
		if err := saveStore(); err != nil {
			jsonError(w, http.StatusInternalServerError, "图片元数据保存失败")
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"message": "上传成功", "image": img})
		return
	}

	if err := r.ParseMultipartForm(16 << 20); err != nil {
		jsonError(w, http.StatusBadRequest, "无法解析上传表单")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "请选择图片文件")
		return
	}
	filename, url, size, err := saveUploadedFile(file, header)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "保存图片失败")
		return
	}
	folderID := r.FormValue("folderId")
	if folderID == "" {
		folderID = state.Folders[0].ID
	}
	tagsRaw := strings.TrimSpace(r.FormValue("tags"))
	description := strings.TrimSpace(r.FormValue("description"))
	tags := []string{}
	if tagsRaw != "" {
		for _, tag := range strings.Split(tagsRaw, ",") {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				tags = append(tags, tag)
			}
		}
	}
	mu.Lock()
	defer mu.Unlock()
	img := ImageItem{ID: imageID(), Name: sanitizeFilename(header.Filename), OriginalName: header.Filename, Filename: filename, URL: url, FolderID: folderID, Description: description, Tags: tags, UploadedAt: currentTimestamp(), Size: size}
	state.Images = append(state.Images, img)
	for i := range state.Users {
		state.Users[i].UploadCount = len(state.Images)
	}
	addActivityWithRequest(r, "上传图片", fmt.Sprintf("上传图片 %s 到 %s", img.OriginalName, folderNameByID(folderID)))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "图片元数据保存失败")
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"message": "上传成功", "image": img})
}

func updateImageHandler(w http.ResponseWriter, r *http.Request, imageID string) {
	var payload struct {
		Name        string `json:"name"`
		FolderID    string `json:"folderId"`
		Tags        string `json:"tags"`
		Description string `json:"description"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for i := range state.Images {
		if state.Images[i].ID == imageID {
			if strings.TrimSpace(payload.Name) != "" {
				state.Images[i].Name = sanitizeFilename(payload.Name)
			}
			if strings.TrimSpace(payload.FolderID) != "" {
				state.Images[i].FolderID = payload.FolderID
			}
			state.Images[i].Description = strings.TrimSpace(payload.Description)
			tags := []string{}
			if strings.TrimSpace(payload.Tags) != "" {
				for _, tag := range strings.Split(payload.Tags, ",") {
					tag = strings.TrimSpace(tag)
					if tag != "" {
						tags = append(tags, tag)
					}
				}
			}
			state.Images[i].Tags = tags
			addActivityWithRequest(r, "编辑图片", fmt.Sprintf("更新图片 %s 的元信息", state.Images[i].OriginalName))
			if err := saveStore(); err != nil {
				jsonError(w, http.StatusInternalServerError, "图片信息保存失败")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "图片信息已更新"})
			return
		}
	}
	jsonError(w, http.StatusNotFound, "未找到对应图片")
}

func deleteImageHandler(w http.ResponseWriter, r *http.Request, imageID string) {
	mu.Lock()
	defer mu.Unlock()
	for i := range state.Images {
		if state.Images[i].ID == imageID {
			image := state.Images[i]
			state.Images = append(state.Images[:i], state.Images[i+1:]...)
			moveFileToTrash(image.Filename)
			state.TrashImages = append(state.TrashImages, TrashImageItem{ImageItem: image, DeletedAt: currentTimestamp(), OriginalURL: image.URL})
			for u := range state.Users {
				state.Users[u].UploadCount = len(state.Images)
			}
			addActivityWithRequest(r, "删除图片", fmt.Sprintf("删除图片 %s，已移入回收站", image.OriginalName))
			if err := saveStore(); err != nil {
				jsonError(w, http.StatusInternalServerError, "删除记录保存失败")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "图片已移入回收站"})
			return
		}
	}
	jsonError(w, http.StatusNotFound, "未找到对应图片")
}

func batchDeleteImagesHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if len(payload.IDs) == 0 {
		jsonError(w, http.StatusBadRequest, "请选择要删除的图片")
		return
	}

	mu.Lock()
	defer mu.Unlock()
	idSet := map[string]struct{}{}
	for _, id := range payload.IDs {
		idSet[id] = struct{}{}
	}
	remaining := make([]ImageItem, 0, len(state.Images))
	deleted := 0
	for _, image := range state.Images {
		if _, ok := idSet[image.ID]; ok {
			moveFileToTrash(image.Filename)
			state.TrashImages = append(state.TrashImages, TrashImageItem{ImageItem: image, DeletedAt: currentTimestamp(), OriginalURL: image.URL})
			deleted++
			continue
		}
		remaining = append(remaining, image)
	}
	state.Images = remaining
	for i := range state.Users {
		state.Users[i].UploadCount = len(state.Images)
	}
	addActivityWithRequest(r, "批量删除图片", fmt.Sprintf("批量删除 %d 张图片，已移入回收站", deleted))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "批量删除保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "批量删除完成"})
}

func batchMoveImagesHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		IDs      []string `json:"ids"`
		FolderID string   `json:"folderId"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if len(payload.IDs) == 0 || strings.TrimSpace(payload.FolderID) == "" {
		jsonError(w, http.StatusBadRequest, "请选择图片和目标文件夹")
		return
	}

	mu.Lock()
	defer mu.Unlock()
	idSet := map[string]struct{}{}
	for _, id := range payload.IDs {
		idSet[id] = struct{}{}
	}
	moved := 0
	for i := range state.Images {
		if _, ok := idSet[state.Images[i].ID]; ok {
			state.Images[i].FolderID = payload.FolderID
			moved++
		}
	}
	addActivityWithRequest(r, "批量移动图片", fmt.Sprintf("批量移动 %d 张图片到 %s", moved, folderNameByID(payload.FolderID)))
	if err := saveStore(); err != nil {
		jsonError(w, http.StatusInternalServerError, "批量移动保存失败")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "批量移动完成"})
}

func batchDownloadImagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	var payload struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		jsonError(w, http.StatusBadRequest, "请求体格式错误")
		return
	}
	if len(payload.IDs) == 0 {
		jsonError(w, http.StatusBadRequest, "请选择要下载的图片")
		return
	}
	mu.Lock()
	idSet := map[string]struct{}{}
	for _, id := range payload.IDs {
		idSet[id] = struct{}{}
	}
	selected := make([]ImageItem, 0, len(payload.IDs))
	for _, image := range state.Images {
		if _, ok := idSet[image.ID]; ok {
			selected = append(selected, image)
		}
	}
	mu.Unlock()
	if len(selected) == 0 {
		jsonError(w, http.StatusNotFound, "未找到可下载的图片")
		return
	}
	streamZipDownload(w, zipName("selected-images"), selected)
}

func downloadFolderHandler(w http.ResponseWriter, folderID string) {
	mu.Lock()
	var folderName string
	selected := make([]ImageItem, 0)
	for _, folder := range state.Folders {
		if folder.ID == folderID {
			folderName = folder.Name
			break
		}
	}
	for _, image := range state.Images {
		if image.FolderID == folderID {
			selected = append(selected, image)
		}
	}
	mu.Unlock()
	if folderName == "" {
		jsonError(w, http.StatusNotFound, "未找到对应文件夹")
		return
	}
	if len(selected) == 0 {
		jsonError(w, http.StatusBadRequest, "该文件夹下暂无可下载图片")
		return
	}
	streamZipDownload(w, zipName(folderName), selected)
}

func imageItemHandler(w http.ResponseWriter, r *http.Request) {
	imageID := strings.TrimPrefix(r.URL.Path, "/api/images/")
	if imageID == "batch-delete" {
		if r.Method == http.MethodPost {
			batchDeleteImagesHandler(w, r)
			return
		}
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if imageID == "batch-move" {
		if r.Method == http.MethodPost {
			batchMoveImagesHandler(w, r)
			return
		}
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if imageID == "download-batch" {
		if r.Method == http.MethodPost {
			batchDownloadImagesHandler(w, r)
			return
		}
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if imageID == "restore" {
		if r.Method == http.MethodPost {
			restoreTrashImageHandler(w, r)
			return
		}
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if strings.HasSuffix(imageID, "/download") {
		if r.Method != http.MethodGet {
			jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
			return
		}
		targetID := strings.TrimSuffix(imageID, "/download")
		mu.Lock()
		var target *ImageItem
		for i := range state.Images {
			if state.Images[i].ID == targetID {
				copyImage := state.Images[i]
				target = &copyImage
				break
			}
		}
		mu.Unlock()
		if target == nil {
			jsonError(w, http.StatusNotFound, "未找到对应图片")
			return
		}
		streamImageDownload(w, *target)
		return
	}
	if imageID == "" {
		jsonError(w, http.StatusBadRequest, "缺少图片 ID")
		return
	}
	if r.Method == http.MethodPut {
		updateImageHandler(w, r, imageID)
		return
	}
	if r.Method == http.MethodDelete {
		deleteImageHandler(w, r, imageID)
		return
	}
	jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
}

func foldersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		foldersGetHandler(w, r)
		return
	}
	if r.Method == http.MethodPost {
		foldersPostHandler(w, r)
		return
	}
	jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
}

func folderItemHandler(w http.ResponseWriter, r *http.Request) {
	folderID := strings.TrimPrefix(r.URL.Path, "/api/folders/")
	if folderID == "restore" {
		if r.Method == http.MethodPost {
			foldersRestoreHandler(w, r)
			return
		}
		jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
		return
	}
	if strings.HasSuffix(folderID, "/download") {
		if r.Method != http.MethodGet {
			jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
			return
		}
		downloadFolderHandler(w, strings.TrimSuffix(folderID, "/download"))
		return
	}
	if r.Method == http.MethodDelete {
		foldersDeleteHandler(w, r)
		return
	}
	jsonError(w, http.StatusMethodNotAllowed, "请求方法不支持")
}

func withCORS(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		handler(w, r)
	}
}

func uploadsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	http.StripPrefix(publicPrefix, http.FileServer(http.Dir(uploadsDir))).ServeHTTP(w, r)
}

func frontendHandler() http.Handler {
	sub, err := fs.Sub(embeddedFrontend, "page")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(sub, path); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}

func main() {
	portFlag := flag.String("port", defaultServerPort, "HTTP listen port")
	flag.Parse()
	port := strings.TrimSpace(*portFlag)
	if port == "" {
		port = defaultServerPort
	}
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}

	initPaths()
	if err := loadStore(); err != nil {
		log.Fatalf("加载数据失败: %v", err)
	}
	startTrashCleanupWorker()
	http.HandleFunc(publicPrefix, uploadsHandler)
	http.HandleFunc("/api/login", withCORS(loginHandler))
	http.HandleFunc("/api/register", withCORS(registerHandler))
	http.HandleFunc("/api/dashboard", withCORS(dashboardHandler))
	http.HandleFunc("/api/activities", withCORS(activitiesHandler))
	http.HandleFunc("/api/profile/avatar", withCORS(profileAvatarHandler))
	http.HandleFunc("/api/team", withCORS(teamGetHandler))
	http.HandleFunc("/api/team/invite", withCORS(teamInviteHandler))
	http.HandleFunc("/api/folders", withCORS(foldersHandler))
	http.HandleFunc("/api/folders/", withCORS(folderItemHandler))
	http.HandleFunc("/api/images", withCORS(imagesGetHandler))
	http.HandleFunc("/api/images/upload", withCORS(imagesUploadHandler))
	http.HandleFunc("/api/images/", withCORS(imageItemHandler))
	http.HandleFunc("/api/trash", withCORS(trashListHandler))
	http.HandleFunc("/api/trash/config", withCORS(trashConfigHandler))
	http.HandleFunc("/api/trash/clear", withCORS(trashClearHandler))
	http.Handle("/", frontendHandler())
	log.Printf("Image Management 单体服务启动，端口 %s...", strings.TrimPrefix(port, ":"))
	log.Fatal(http.ListenAndServe(port, nil))
}
