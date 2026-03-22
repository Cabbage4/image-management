// 配置文件：管理后端 API 地址
const API_BASE_URL = (() => {
  const origin = window.location.origin;
  if (origin === 'http://127.0.0.1:8080' || origin === 'http://localhost:8080') {
    return 'http://127.0.0.1:3210';
  }
  return origin;
})();

export default API_BASE_URL;
