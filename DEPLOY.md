# Dùng cho team qua ngrok

Cách này: bạn chạy `server.js` trên máy, **ngrok** tạo một URL public chĩa vào server đó. Team mở URL là dùng được, không cần cài gì.

> Lưu ý: máy bạn phải đang **bật và chạy server** thì team mới truy cập được. Dữ liệu team sửa sẽ ghi thẳng vào file trong repo **trên máy bạn** — sau đó bạn `git push` để lên GitHub/CDN.

---

## 1. Chạy server ở máy

```bash
node server.js
```
(chạy tại cổng 4321)

Nếu muốn **bảo vệ bằng mật khẩu** (nên làm vì URL ngrok là public):

```bash
ADMIN_PASSWORD="matkhau-cua-team" node server.js
```
Lần đầu mở trang, team sẽ được hỏi mật khẩu này.

## 2. Cài & chạy ngrok

```bash
# Cài (macOS)
brew install ngrok
# hoặc tải tại https://ngrok.com/download

# Đăng nhập 1 lần (lấy token ở dashboard ngrok)
ngrok config add-authtoken <TOKEN_CUA_BAN>

# Mở tunnel tới server
ngrok http 4321
```

ngrok in ra URL kiểu `https://abcd-1234.ngrok-free.app` → **gửi link này cho team**.

## 3. Sau khi team sửa xong

Dữ liệu mới nằm trong file trên máy bạn. Đẩy lên GitHub để jsDelivr cập nhật:

```bash
git add -A && git commit -m "update data" && git push
```

---

## Mẹo

- **URL ngrok đổi mỗi lần chạy lại** (gói miễn phí). Muốn URL cố định thì đăng ký domain tĩnh trên ngrok (`ngrok http --domain=ten-cua-ban.ngrok-free.app 4321`).
- Trang web đã tự gửi header bỏ qua trang cảnh báo của ngrok cho các thao tác lưu/upload, nên không bị lỗi.
- Video lớn upload thoải mái (không giới hạn dung lượng như serverless).
- Muốn tắt mật khẩu: chạy `node server.js` bình thường (không đặt `ADMIN_PASSWORD`).
