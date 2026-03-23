# Image Management

一个前后端同源（Go + 原生 HTML/CSS/JS）的图片管理应用，支持：

- 用户注册/登录
- 图片上传、批量上传
- 文件夹管理（新建/删除/恢复/拖拽排序）
- 图片检索、批量操作（下载/移动/删除）
- 回收站与自动清理
- 基础图片编辑器
- 操作日志

---

## 1. 项目结构

```text
image-management/
├─ app/
│  ├─ main.go                 # Go 服务入口 + API 路由
│  ├─ activity.go             # 操作日志模型与处理
│  ├─ go.mod / go.sum
│  └─ page/
│     ├─ *.html               # 页面
│     ├─ styles.css           # 全局样式
│     ├─ gallery.js           # 图库主逻辑
│     ├─ gallery.templates.js # 图库模板拆分（卡片/文件夹行）
│     ├─ editor.js            # 图片编辑器逻辑
│     └─ ...
├─ build.sh                   # 构建脚本（正确入口）
├─ dist/
│  ├─ image-management        # 可执行文件
│  └─ data/                   # 运行期数据（首次运行自动生成）
└─ product/                   # 需求与视觉稿
```

---

## 2. 构建与启动

### 2.1 构建

在项目根目录执行：

```bash
./build.sh
```

产物：

```text
dist/image-management
```

### 2.2 启动

默认端口 `8081`：

```bash
cd dist
./image-management
```

自定义端口：

```bash
./image-management -port 9000
```

访问地址：

```text
http://127.0.0.1:8081
```

---

## 3. 数据目录说明

程序首次运行会自动创建（相对于二进制目录）：

```text
data/
├─ store.json       # 业务数据（用户/图片/文件夹/日志/回收站）
├─ uploads/         # 原图
├─ thumbs/          # 压缩缩略图
└─ trash_uploads/   # 回收站图片
```

说明：

- 列表展示优先使用 `thumbs/` 中的缩略图（减轻前端加载压力）
- 下载按钮始终走原图（`uploads/`）

---

## 4. 关键接口（节选）

### 鉴权与用户

- `POST /api/register`
- `POST /api/login`
- `POST /api/password/forgot-reset`
- `GET  /api/dashboard`

### 图片

- `GET  /api/images`
- `POST /api/images/upload`
- `POST /api/images/upload-batch`
- `PUT  /api/images/:id`
- `DELETE /api/images/:id`
- `POST /api/images/batch-delete`
- `POST /api/images/batch-move`
- `POST /api/images/download-batch`
- `GET  /api/images/:id/download`（下载原图）

### 文件夹

- `GET  /api/folders`
- `POST /api/folders`
- `DELETE /api/folders/:id`
- `POST /api/folders/restore`
- `POST /api/folders/reorder`（拖拽排序持久化）
- `GET  /api/folders/:id/download`

### 回收站

- `GET  /api/trash`
- `POST /api/images/restore`
- `POST /api/trash/config`
- `POST /api/trash/clear`

---

## 5. 本次代码优化说明（已落地）

### 前端

- `gallery.js` 拆分模板到 `gallery.templates.js`，降低单文件复杂度
- 事件委托替代大量逐卡监听器，降低交互开销
- 列表过滤增加缓存，减少重复计算
- 缩略图懒加载（`loading="lazy"`）

### 后端

- 上传后自动生成缩略图并返回 `thumbUrl/thumbSmallUrl/thumbMediumUrl`
- 启动时为历史图片补齐缩略图（可恢复旧数据兼容）
- 文件夹支持顺序持久化（拖拽排序）

---

## 6. 开发建议

- 修改前端资源后建议同步更新 `?v=` 版本，避免浏览器缓存
- 每次改动后执行：

```bash
./build.sh
cd dist && ./image-management -port 8081
```

- 若线上调试卡顿，优先检查：
  1) 图片是否命中缩略图地址
  2) 前端是否加载最新 `gallery.js` 版本
  3) 是否存在旧进程占用同端口

---

## 7. License

当前仓库未声明开源协议，如需对外发布请补充 LICENSE。
