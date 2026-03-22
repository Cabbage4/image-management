# Image Management

一个前后端同源的单体图片管理应用。

## 目录结构

```text
image-management/
  app/      # Go 应用源码 + 页面资源
  build.sh  # 构建脚本
  dist/     # 构建产物
  product/  # 设计稿与需求文档
```

## 构建

在项目根目录执行：

```bash
./scripts/build.sh
```

构建后会生成：

```text
dist/image-management
```

## 运行

默认端口：`8081`

```bash
cd dist
./image-management
```

自定义端口：

```bash
./image-management -port 9000
```

## 数据目录

程序第一次运行时，会在二进制同级目录自动生成：

```text
data/
  store.json
  uploads/
  trash_uploads/
```

后续重启会继续读取已有数据，不会因为重启重置。

## 访问地址

默认启动后访问：

```text
http://127.0.0.1:8081
```

## 说明

- 前后端同源运行
- 页面资源位于 `app/page/`
- 主程序入口位于 `app/main.go`
