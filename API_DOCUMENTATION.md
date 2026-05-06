# Tài Liệu API - Hệ Thống Quản Lý Ký Túc Xá Thông Minh

## Thông Tin Hệ Thống

| Thuộc Tính | Giá Trị |
|------------|---------|
| **Tên** | Ký Túc Xá Thông Minh |
| **Phiên Bản** | 1.0.0 |
| **Base URL** | `http://localhost:5000/api` |
| **Framework** | Express.js + MongoDB |

## Cấu Trúc Authentication

Tất cả API (trừ public routes) yêu cầu **Bearer Token** trong header:

```
Authorization: Bearer <access_token>
```

## Response Format

```json
{
  "success": true/false,
  "message": "Thông báo",
  "data": { ... },
  "pagination": { ... } // Nếu có phân trang
}
```

---

## 1. AUTHENTICATION API

Base Path: `/api/auth`

### 1.1 Public Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/register` | Đăng ký tài khoản | `fullName, email, password, confirmPassword, role` |
| **POST** | `/login` | Đăng nhập | `email, password` |
| **POST** | `/refresh-token` | Làm mới token | `refreshToken` |
| **POST** | `/verify-otp` | Xác thực OTP email | `email, otp` |
| **POST** | `/resend-otp` | Gửi lại OTP | `email` |

### 1.2 Protected Routes (Yêu cầu Bearer Token)

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **GET** | `/me` | Lấy thông tin user hiện tại | - |
| **PATCH** | `/update-profile` | Cập nhật hồ sơ | `fullName, phoneNumber, dateOfBirth, gender, identityCard, studentId, university, major, className, academicYear` |
| **PUT** | `/update-fcm-token` | Cập nhật FCM token | `fcmToken` |
| **POST** | `/logout` | Đăng xuất | - |

---

## 2. REGISTRATION API (Đăng Ký Ở KTX)

Base Path: `/api/registrations`

### 2.1 Public Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **GET** | `/:id/status` | Lấy trạng thái đăng ký |
| **GET** | `/preview-residence/:id` | Xem trước form nội trú (HTML) |
| **GET** | `/preview-temporary/:id` | Xem trước form tạm trú (HTML) |

### 2.2 Student Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/` | Tạo form đăng ký mới | - |
| **PATCH** | `/:id/step1` | Lưu bước 1 | Form data |
| **PATCH** | `/:id/step2` | Lưu bước 2 | Form data |
| **POST** | `/:id/documents/sensitive` | Upload CCCD/Thẻ SV (multipart) | `image` |
| **POST** | `/:id/documents` | Upload tài liệu | `fileUrl` |
| **POST** | `/:id/submit` | Submit form | - |
| **POST** | `/:id/stamped-form` | Upload đơn đã đóng dấu | - |
| **GET** | `/my-forms` | Lấy danh sách form của tôi | - |
| **GET** | `/my-current` | Lấy form hiện tại (draft/active) | - |
| **POST** | `/claim-form` | Liên kết form offline | `registrationFormCode, verificationInfo` |
| **GET** | `/:id` | Lấy chi tiết form | - |
| **DELETE** | `/:id` | Xóa form nháp | - |

### 2.3 Admin Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **GET** | `/` | Lấy tất cả forms (có phân trang) |
| **PATCH** | `/:id/request-missing` | Yêu cầu bổ sung tài liệu |
| **PATCH** | `/:id/approve` | Phê duyệt form |
| **PATCH** | `/:id/reject` | Từ chối form |
| **PATCH** | `/:id/confirm` | Xác nhận single form |
| **POST** | `/admin/confirm` | Xác nhận batch |
| **GET** | `/admin/stats` | Thống kê admin |
| **POST** | `/admin/check-overdue` | Kiểm tra forms quá hạn |
| **POST** | `/:id/review-documents` | Review tài liệu |
| **POST** | `/:id/mark-received` | Đánh dấu đã nhận offline |
| **PATCH** | `/:id/offline-data` | Lưu dữ liệu offline |
| **POST** | `/:id/offline-documents` | Upload tài liệu offline |
| **PATCH** | `/:id/processing` | Chuyển sang processing |
| **PATCH** | `/:id/assign-user` | Gán user vào form |

---

## 3. BUILDING API (Quản Lý Tòa Nhà)

Base Path: `/api/buildings`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/` | Lấy tất cả tòa nhà | Student/Admin |
| **GET** | `/:id` | Lấy chi tiết tòa nhà | Student/Admin |
| **GET** | `/stats/:id` | Lấy thống kê tòa nhà | Student/Admin |
| **GET** | `/sync-stats/:id` | Đồng bộ thống kê | Admin |
| **POST** | `/` | Tạo tòa nhà mới | Admin |
| **PUT** | `/:id` | Cập nhật tòa nhà | Admin |
| **DELETE** | `/:id` | Xóa tòa nhà | Admin |

### Building Model

| Field | Type | Mô Tả |
|-------|------|-------|
| `buildingCode` | String | Mã tòa nhà (unique) |
| `buildingName` | String | Tên tòa nhà |
| `buildingType` | Enum | `male`, `female`, `mixed` |
| `totalFloors` | Number | Số tầng |
| `address` | String | Địa chỉ |
| `description` | String | Mô tả |
| `status` | Enum | `active`, `inactive`, `maintenance` |
| `stats` | Object | Thống kê phòng |

---

## 4. ROOM API (Quản Lý Phòng)

Base Path: `/api/rooms`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/` | Lấy tất cả phòng | Student/Admin |
| **GET** | `/available` | Lấy phòng trống | Student/Admin |
| **GET** | `/by-code/:roomCode` | Tìm phòng theo mã | Student/Admin |
| **GET** | `/building/:buildingId` | Lấy phòng theo tòa nhà | Student/Admin |
| **GET** | `/:id` | Lấy chi tiết phòng | Student/Admin |
| **POST** | `/` | Tạo phòng mới | Admin |
| **POST** | `/bulk` | Tạo nhiều phòng | Admin |
| **POST** | `/auto-generate` | Tạo phòng tự động | Admin |
| **PUT** | `/:id` | Cập nhật phòng | Admin |
| **PATCH** | `/:id/status` | Cập nhật trạng thái | Admin |
| **DELETE** | `/:id` | Xóa phòng | Admin |

### Room Model

| Field | Type | Mô Tả |
|-------|------|-------|
| `buildingId` | ObjectId | ID tòa nhà |
| `roomNumber` | String | Số phòng |
| `floor` | Number | Tầng |
| `roomCode` | String | Mã phòng (unique) |
| `roomType` | Enum | `2-bed`, `4-bed`, `6-bed`, `8-bed` |
| `capacity` | Number | Sức chứa |
| `currentOccupancy` | Number | Số người hiện tại |
| `roomStatus` | Enum | `available`, `full`, `maintenance`, `reserved` |
| `gender` | Enum | `male`, `female` |
| `pricePerMonth` | Number | Giá/tháng |

---

## 5. ROOM ASSIGNMENT API (Phân Phòng)

Base Path: `/api/room-assignments`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/` | Lấy tất cả phân phòng | Admin |
| **GET** | `/my-assignment` | Lấy phân phòng hiện tại của tôi | Student |
| **GET** | `/student/:studentId/history` | Lịch sử phân phòng sinh viên | Admin |
| **GET** | `/room/:roomId/history` | Lịch sử người ở phòng | Admin |
| **GET** | `/suggest/:studentId` | Gợi ý phòng | Student/Admin |
| **GET** | `/report/availability` | Báo cáo phòng trống | Admin |
| **GET** | `/:id` | Chi tiết phân phòng | Student/Admin |
| **POST** | `/assign` | Phân phòng thủ công | Admin |
| **POST** | `/transfer` | Chuyển phòng | Admin |
| **POST** | `/checkout` | Check-out | Admin |
| **POST** | `/auto/find-best` | Tìm phòng tốt nhất | Admin |
| **POST** | `/auto/assign` | Phân phòng tự động | Admin |
| **POST** | `/auto/assign-multiple` | Phân phòng hàng loạt | Admin |
| **POST** | `/auto/group/find-room` | Tìm phòng cho nhóm | Admin |
| **POST** | `/auto/group/assign` | Phân phòng cho nhóm | Admin |

---

## 6. CONTRACT API (Hợp Đồng)

Base Path: `/api/contracts`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/my-contract` | Lấy hợp đồng của tôi | Student |
| **GET** | `/stats` | Thống kê hợp đồng | Admin |
| **GET** | `/` | Lấy tất cả hợp đồng | Admin |
| **GET** | `/:id` | Chi tiết hợp đồng | Student/Admin |
| **POST** | `/` | Tạo hợp đồng mới | Admin |
| **PUT** | `/:id` | Cập nhật hợp đồng | Admin |
| **DELETE** | `/:id` | Xóa hợp đồng | Admin |
| **PATCH** | `/:id/sign-student` | Sinh viên ký | Student |
| **PATCH** | `/:id/sign-admin` | Admin ký | Admin |
| **PATCH** | `/:id/terminate` | Chấm dứt hợp đồng | Admin |

### Contract Status

| Status | Mô Tả |
|--------|-------|
| `draft` | Mới tạo, chưa ký |
| `pending_signature` | Chờ chữ ký |
| `active` | Đã ký, đang hiệu lực |
| `expired` | Hết hạn |
| `terminated` | Chấm dứt trước hạn |
| `cancelled` | Hủy bỏ |

---

## 7. INVOICE API (Hóa Đơn)

Base Path: `/api/invoices`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/my-invoices` | Lấy hóa đơn của tôi | Student |
| **GET** | `/my-pending` | Lấy hóa đơn chờ thanh toán | Student |
| **GET** | `/overdue` | Lấy hóa đơn quá hạn | Admin |
| **GET** | `/stats` | Thống kê hóa đơn | Admin |
| **GET** | `/` | Lấy tất cả hóa đơn | Admin |
| **GET** | `/:id` | Chi tiết hóa đơn | Student/Admin |
| **POST** | `/` | Tạo hóa đơn | Admin |
| **POST** | `/generate-monthly` | Tạo hóa đơn hàng tháng | Admin |
| **PATCH** | `/:id/discount` | Áp dụng giảm giá | Admin |
| **PATCH** | `/:id/cancel` | Hủy hóa đơn | Admin |
| **PATCH** | `/:id/mark-overdue` | Đánh dấu quá hạn | Admin |

### Invoice Item Types

| Type | Mô Tả |
|------|-------|
| `room_rent` | Tiền phòng |
| `electricity` | Tiền điện |
| `water` | Tiền nước |
| `internet` | Internet |
| `laundry` | Giặt là |
| `cleaning` | Vệ sinh |
| `security` | An ninh |
| `deposit` | Tiền cọc |
| `penalty` | Phí phạt |
| `late_fee` | Phí trễ hạn |
| `other` | Khác |

### Invoice Status

| Status | Mô Tả |
|--------|-------|
| `pending` | Chờ thanh toán |
| `partial` | Thanh toán một phần |
| `paid` | Đã thanh toán đủ |
| `overdue` | Quá hạn |
| `cancelled` | Đã hủy |
| `refunded` | Đã hoàn tiền |

---

## 8. PAYMENT API (Thanh Toán)

Base Path: `/api/payments`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/my-payments` | Lấy lịch sử thanh toán | Student |
| **GET** | `/pending-verifications` | Lấy thanh toán chờ xác nhận | Admin |
| **GET** | `/stats` | Thống kê thanh toán | Admin |
| **GET** | `/` | Lấy tất cả thanh toán | Admin |
| **GET** | `/:id` | Chi tiết thanh toán | Student/Admin |
| **POST** | `/` | Tạo thanh toán | Student |
| **PATCH** | `/:id/verify` | Xác nhận thanh toán | Admin |
| **PATCH** | `/:id/reject` | Từ chối thanh toán | Admin |
| **PATCH** | `/:id/process-online` | Xử lý thanh toán online | Student |
| **PATCH** | `/:id/refund` | Hoàn tiền | Admin |
| **PATCH** | `/:id/retry` | Thử lại thanh toán | Student |
| **PATCH** | `/:id/receipt` | Tạo biên lai | Student |

### Payment Methods

| Method | Mô Tả |
|--------|-------|
| `bank_transfer` | Chuyển khoản ngân hàng |
| `momo` | Ví MoMo |
| `vnpay` | VNPay |
| `zalopay` | ZaloPay |
| `cash` | Tiền mặt |
| `other` | Khác |

### Payment Status

| Status | Mô Tả |
|--------|-------|
| `pending` | Chờ xử lý |
| `processing` | Đang xử lý |
| `completed` | Thành công |
| `failed` | Thất bại |
| `cancelled` | Đã hủy |
| `refunded` | Đã hoàn tiền |

---

## 9. BILLING SPLIT API (Chia Tiền Phòng)

Base Path: `/api/billing-splits`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/room/:roomId` | Lấy cấu hình chia tiền | Student/Admin |
| **POST** | `/` | Tạo cấu hình chia tiền | Admin |
| **PATCH** | `/room/:roomId/config` | Cập nhật cấu hình | Admin |
| **POST** | `/room/:roomId/add-student` | Thêm sinh viên vào chia tiền | Admin |
| **PATCH** | `/room/:roomId/remove-student/:studentId` | Xóa sinh viên khỏi chia | Admin |
| **PATCH** | `/room/:roomId/primary-payer` | Đặt người đóng chính | Admin |
| **POST** | `/room/:roomId/preview` | Xem trước chia tiền | Admin |
| **GET** | `/my-bills` | Lấy hóa đơn của tôi | Student |
| **GET** | `/student/:studentId` | Lấy hóa đơn sinh viên | Admin |
| **GET** | `/student-bill/:id` | Chi tiết hóa đơn | Student/Admin |
| **POST** | `/student-bill/:id/pay` | Thanh toán hóa đơn | Student |
| **POST** | `/split-invoice` | Chia hóa đơn hiện có | Admin |
| **GET** | `/room/:roomId/summary` | Tổng hợp hóa đơn phòng | Admin |

---

## 10. SEMESTER INVOICE API (Hóa Đơn Học Kỳ)

Base Path: `/api/semester-invoices`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/my-invoices` | Lấy hóa đơn học kỳ của tôi | Student |
| **GET** | `/stats` | Thống kê hóa đơn học kỳ | Admin |
| **GET** | `/pending` | Lấy hóa đơn chờ xử lý | Admin |
| **GET** | `/` | Lấy tất cả hóa đơn học kỳ | Admin |
| **GET** | `/:id` | Chi tiết hóa đơn học kỳ | Student/Admin |
| **POST** | `/generate` | Tạo hóa đơn tiền phòng | Admin |
| **POST** | `/generate-6month` | Tạo hóa đơn 6 tháng | Admin |
| **POST** | `/generate-monthly` | Tạo hóa đơn hàng tháng | Admin |
| **PATCH** | `/:id/pay` | Thanh toán hóa đơn học kỳ | Student |
| **PATCH** | `/:id/discount` | Áp dụng giảm giá | Admin |
| **PATCH** | `/:id/cancel` | Hủy hóa đơn | Admin |

---

## 11. UTILITY API (Điện/Nước)

Base Path: `/api/utilities`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/meter-readings` | Lấy chỉ số đồng hồ | Admin |
| **GET** | `/meter-readings/by-month` | Lấy chỉ số theo tháng | Admin |
| **GET** | `/meter-readings/room/:roomId` | Lịch sử chỉ số phòng | Student/Admin |
| **GET** | `/meter-readings/:id` | Chi tiết chỉ số | Student/Admin |
| **POST** | `/meter-readings` | Tạo chỉ số mới | Admin |
| **PUT** | `/meter-readings/:id` | Cập nhật chỉ số | Admin |
| **PATCH** | `/meter-readings/:id/verify` | Xác nhận chỉ số | Admin |
| **DELETE** | `/meter-readings/:id` | Xóa chỉ số | Admin |
| **GET** | `/rates` | Lấy tất cả giá điện/nước | Student/Admin |
| **GET** | `/rates/active` | Lấy giá đang áp dụng | Student/Admin |
| **POST** | `/rates` | Tạo giá mới | Admin |
| **PUT** | `/rates/:id` | Cập nhật giá | Admin |
| **POST** | `/rates/init-default` | Khởi tạo giá mặc định | Admin |
| **POST** | `/calculate` | Tính tiền điện/nước | Admin |

---

## 12. SERVICE API (Dịch Vụ)

Base Path: `/api/services`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/my-services` | Lấy dịch vụ của tôi | Student |
| **GET** | `/active` | Lấy dịch vụ đang hoạt động | Student/Admin |
| **GET** | `/` | Lấy tất cả dịch vụ | Admin |
| **GET** | `/:id` | Chi tiết dịch vụ | Student/Admin |
| **POST** | `/` | Tạo dịch vụ mới | Admin |
| **PUT** | `/:id` | Cập nhật dịch vụ | Admin |
| **DELETE** | `/:id` | Xóa dịch vụ | Admin |
| **POST** | `/init-default` | Khởi tạo dịch vụ mặc định | Admin |
| **POST** | `/calculate` | Tính chi phí dịch vụ | Student/Admin |
| **POST** | `/room-subscriptions` | Tạo đăng ký dịch vụ phòng | Admin |
| **GET** | `/room-subscriptions/:roomId` | Lấy dịch vụ phòng | Student/Admin |
| **POST** | `/room-subscriptions/:roomId/subscribe` | Đăng ký dịch vụ | Student |
| **PATCH** | `/room-subscriptions/:roomId/unsubscribe/:serviceCode` | Hủy đăng ký | Student |
| **GET** | `/laundry/types` | Lấy loại giặt là | Student/Admin |
| **POST** | `/laundry/calculate` | Tính giá giặt là | Student/Admin |

---

## 13. MAINTENANCE API (Bảo Trì/Sửa Chữa)

Base Path: `/api/maintenance`

### 13.1 Student Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/` | Tạo yêu cầu sửa chữa | `category, priority, title, description, images` |
| **GET** | `/my-requests` | Lấy yêu cầu của tôi | - |
| **GET** | `/:id` | Chi tiết yêu cầu | - |
| **PUT** | `/:id` | Cập nhật yêu cầu | Form data |
| **DELETE** | `/:id` | Hủy yêu cầu | - |
| **POST** | `/:id/rate` | Đánh giá | `score, comment` |

### 13.2 Admin Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **GET** | `/admin/all` | Lấy tất cả yêu cầu |
| **GET** | `/admin/pending-unviewed` | Lấy yêu cầu chưa xem |
| **GET** | `/admin/statistics` | Thống kê |
| **GET** | `/admin/my-assignments` | Yêu cầu được phân công cho tôi |
| **GET** | `/admin/:id` | Chi tiết yêu cầu (admin) |
| **PUT** | `/admin/:id/status` | Cập nhật trạng thái |
| **PUT** | `/admin/:id/assign` | Phân công kỹ thuật viên |
| **PUT** | `/admin/:id/schedule` | Lên lịch sửa chữa |
| **PUT** | `/admin/:id/complete` | Hoàn thành yêu cầu |

### Maintenance Categories

| Category | Mô Tả |
|----------|-------|
| `electrical` | Điện: công tắc, ổ cắm, đèn, quạt |
| `plumbing` | Nước: vòi nước, bồn cầu, thông tắc |
| `furniture` | Nội thất: giường, tủ, bàn ghế |
| `door_window` | Cửa và cửa sổ: khóa, bản lề, kính |
| `ac` | Máy lạnh |
| `appliance` | Thiết bị: tủ lạnh, máy giặt |
| `network` | Mạng internet, wifi |
| `security` | An ninh: camera, khóa cửa |
| `cleaning` | Vệ sinh: dọn dẹp, khử mùi |
| `pest` | Côn trùng: kiến, gián, muỗi |
| `other` | Khác |

### Maintenance Status

| Status | Mô Tả |
|--------|-------|
| `pending` | Chờ xử lý |
| `reviewing` | Đang xem xét |
| `assigned` | Đã phân công |
| `in_progress` | Đang sửa chữa |
| `paused` | Tạm dừng |
| `completed` | Hoàn thành |
| `cancelled` | Đã hủy |
| `rejected` | Từ chối |

---

## 14. NOTIFICATION API (Thông Báo)

Base Path: `/api/notifications`

### 14.1 User Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **GET** | `/` | Lấy thông báo của tôi |
| **GET** | `/unread-count` | Số thông báo chưa đọc |
| **GET** | `/stats` | Thống kê thông báo |
| **GET** | `/:id` | Chi tiết thông báo |
| **PATCH** | `/:id/read` | Đánh dấu đã đọc |
| **PATCH** | `/read-all` | Đánh dấu tất cả đã đọc |
| **DELETE** | `/:id` | Xóa thông báo |
| **DELETE** | `/read-all` | Xóa tất cả đã đọc |

### 14.2 Preferences Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **GET** | `/preferences` | Lấy cài đặt thông báo |
| **PATCH** | `/preferences` | Cập nhật cài đặt |
| **POST** | `/fcm-token` | Cập nhật FCM token |
| **DELETE** | `/fcm-token` | Xóa FCM token |

### 14.3 Admin Routes

| Method | Endpoint | Mô Tả |
|--------|----------|-------|
| **POST** | `/send-to-users` | Gửi cho nhiều người |
| **POST** | `/send-to-all` | Gửi cho tất cả |
| **POST** | `/create` | Tạo thông báo |
| **GET** | `/admin/all` | Lấy tất cả thông báo |
| **GET** | `/admin/stats` | Thống kê hệ thống |
| **DELETE** | `/admin/cleanup` | Dọn dẹp thông báo hết hạn |

---

## 15. UPLOAD API

Base Path: `/api/upload`

| Method | Endpoint | Content-Type | Mô Tả | Field |
|--------|----------|--------------|-------|-------|
| **POST** | `/image` | multipart/form-data | Upload ảnh | `image` (jpeg, png, webp, gif, max 5MB) |
| **POST** | `/document` | multipart/form-data | Upload tài liệu | `document` (pdf, doc, docx, max 10MB) |
| **POST** | `/avatar` | multipart/form-data | Upload avatar | `avatar` (crop 400x400) |
| **POST** | `/multiple` | multipart/form-data | Upload nhiều file | `files[]` (max 10 files) |
| **DELETE** | `/` | application/json | Xóa file | `{ publicId?, url?, resourceType? }` |

### Cloudinary Folder Structure

```
KyTucXa/{userId}/images/      ← Ảnh thường
KyTucXa/{userId}/documents/   ← Tài liệu
KyTucXa/{userId}/avatars/     ← Avatar (400x400)
```

---

## 16. STUDENT API

Base Path: `/api/students`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/` | Lấy tất cả sinh viên | Admin |
| **GET** | `/pending-room` | Lấy sinh viên chờ phân phòng | Admin |
| **GET** | `/:id` | Chi tiết sinh viên | Admin |

### Student Status (KTX)

| Status | Mô Tả |
|--------|-------|
| `not_registered` | Chưa đăng ký |
| `waiting_room` | Đang chờ phân phòng |
| `checked_in` | Đang ở |
| `checked_out` | Đã check-out |
| `banned` | Bị cấm |

---

## 17. AUDIT LOG API

Base Path: `/api/audit-logs`

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| **GET** | `/` | Lấy tất cả audit logs | Admin |
| **GET** | `/:id` | Chi tiết audit log | Admin |
| **GET** | `/user/:userId` | Audit logs theo user | Admin |

---

## Models Summary

### User Model
| Field | Type | Required |
|-------|------|----------|
| fullName | String | Yes |
| email | String | Yes (unique) |
| password | String | Yes |
| role | Enum (admin/student) | Yes |
| status | Enum (active/inactive) | Yes |
| identityCard | String | No |
| dateOfBirth | Date | No |
| gender | Enum (male/female/other) | No |
| phoneNumber | String | No |
| isEmailVerified | Boolean | Yes |
| isAccountVerified | Boolean | Yes |

### Student Model
| Field | Type | Required |
|-------|------|----------|
| userId | ObjectId | Yes |
| studentId | String | Yes (unique) |
| university | String | Yes |
| major | String | No |
| className | String | No |
| academicYear | String | No |
| currentRoom | ObjectId | No |
| currentContract | ObjectId | No |
| studentStatus | Enum | Yes |
| ktxStatus | Enum | Yes |

### Building Model
| Field | Type | Required |
|-------|------|----------|
| buildingCode | String | Yes (unique) |
| buildingName | String | Yes |
| buildingType | Enum | Yes |
| totalFloors | Number | Yes |
| status | Enum | Yes |

### Room Model
| Field | Type | Required |
|-------|------|----------|
| buildingId | ObjectId | Yes |
| roomNumber | String | Yes |
| floor | Number | Yes |
| roomCode | String | Yes (unique) |
| roomType | Enum (2/4/6/8-bed) | Yes |
| capacity | Number | Yes |
| currentOccupancy | Number | Yes |
| roomStatus | Enum | Yes |
| gender | Enum (male/female) | Yes |

### Contract Model
| Field | Type | Required |
|-------|------|----------|
| contractCode | String | Yes (unique) |
| studentId | ObjectId | Yes |
| roomId | ObjectId | Yes |
| roomAssignmentId | ObjectId | Yes |
| startDate | Date | Yes |
| endDate | Date | Yes |
| duration | Number | Yes |
| monthlyRent | Number | Yes |
| status | Enum | Yes |

---

## Error Codes

| HTTP Code | Mô Tả |
|-----------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Authentication Flow

```
1. Register (POST /api/auth/register)
   → Gửi OTP qua email

2. Verify OTP (POST /api/auth/verify-otp)
   → Tài khoản được kích hoạt

3. Login (POST /api/auth/login)
   → Nhận access_token + refresh_token

4. Access Protected Routes
   → Header: Authorization: Bearer {access_token}

5. Refresh Token (POST /api/auth/refresh-token)
   → Làm mới access_token khi hết hạn

6. Logout (POST /api/auth/logout)
   → Token bị blacklist
```

## User Registration Workflow

```
1. Đăng ký tài khoản
2. Xác thực email (OTP)
3. Cập nhật thông tin cá nhân (fullName, phone, dob, gender, CCCD)
4. Cập nhật thông tin sinh viên (studentId, university, major, class)
5. Đợi admin kích hoạt tài khoản
6. Bắt đầu đăng ký ở KTX
```

## 18. SUPPORT SYSTEM API (Chat, Ticket, FAQ, Feedback)

Base Path: `/api/support`

### 18.1 CHAT API

#### Student Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/chat/rooms` | Tạo phòng chat mới | `title, participantIds, roomType` |
| **GET** | `/chat/rooms/my` | Lấy phòng chat của tôi | Query: `status, page, limit` |
| **GET** | `/chat/rooms/unread-count` | Số tin nhắn chưa đọc | - |
| **GET** | `/chat/rooms/:roomId` | Chi tiết phòng chat | - |
| **GET** | `/chat/rooms/:roomId/messages` | Lấy tin nhắn | Query: `page, limit, before` |
| **POST** | `/chat/rooms/:roomId/messages` | Gửi tin nhắn | `content, messageType, replyToId` |
| **PATCH** | `/chat/rooms/:roomId/close` | Đóng phòng chat | - |

#### Admin Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **GET** | `/admin/chat/rooms` | Tất cả phòng chat | Query: `status, assignedTo, page, limit` |
| **PATCH** | `/admin/chat/rooms/:roomId/assign` | Phân công admin | `adminId` |

#### Socket.IO Events

```javascript
// Kết nối
const socket = io('ws://localhost:5000/socket.io/chat', {
  auth: { token: 'Bearer_TOKEN' }
});

// Events Client → Server
socket.emit('join_room', { roomId: 'xxx' });
socket.emit('send_message', { roomId: 'xxx', content: 'Hello', tempId: 'local-1' });
socket.emit('typing', { roomId: 'xxx', isTyping: true });
socket.emit('mark_read', { roomId: 'xxx' });

// Events Server → Client
socket.on('new_message', (data) => { ... });
socket.on('unread_update', ({ roomId, unreadCount }) => { ... });
socket.on('typing', ({ userId, roomId, isTyping }) => { ... });
socket.on('user_joined', ({ userId, joinedAt }) => { ... });
socket.on('messages_read', ({ userId, roomId, readAt }) => { ... });
socket.on('unread_count', ({ totalUnread }) => { ... });
```

### 18.2 TICKET API (Hệ Thống Ticket Hỗ Trợ)

#### Student Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/tickets` | Tạo ticket mới | `title, description, category, priority, attachments` |
| **GET** | `/tickets/my` | Lấy ticket của tôi | Query: `status, page, limit` |
| **GET** | `/tickets/:id` | Chi tiết ticket | - |
| **PATCH** | `/tickets/:id` | Cập nhật ticket | `title, description, category, priority` |
| **PATCH** | `/tickets/:id/rate` | Đánh giá ticket | `rating, comment` |

#### Ticket Categories (Auto-detect)

| Category | Keywords | Priority |
|----------|----------|----------|
| `billing` | hóa đơn, thanh toán, tiền | medium |
| `maintenance` | sửa chữa, hỏng | medium |
| `internet` | mạng, wifi | medium |
| `security` | an ninh, bảo vệ | high |
| `noise_complaint` | ồn ào, khiếu nại | medium |
| `room_issue` | phòng, chuyển phòng | low |
| `other` | khác | low |

#### Admin Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **GET** | `/admin/tickets` | Tất cả tickets | Query: `status, category, priority, unassigned, overdue` |
| **GET** | `/admin/tickets/statistics` | Thống kê tickets | Query: `startDate, endDate` |
| **PATCH** | `/admin/tickets/:id/assign` | Phân công | `adminId` |
| **PATCH** | `/admin/tickets/:id/status` | Cập nhật trạng thái | `status, note` |
| **POST** | `/admin/tickets/:id/comment` | Thêm bình luận | `comment` |

### 18.3 FAQ API (Câu Hỏi Thường Gặp)

#### Public Routes

| Method | Endpoint | Mô Tả | Query Params |
|--------|----------|-------|--------------|
| **GET** | `/faqs` | Danh sách FAQ | `category, search, isActive, page, limit` |
| **GET** | `/faqs/:id` | Chi tiết FAQ | - |
| **GET** | `/faqs/category/:category` | FAQ theo danh mục | - |
| **GET** | `/faqs/search` | Tìm kiếm FAQ | `q` |
| **POST** | `/faqs/:id/rate` | Đánh giá FAQ | `helpful: boolean` |

#### FAQ Categories

| Category | Mô Tả |
|----------|-------|
| `registration` | Đăng ký ở KTX |
| `room` | Phòng ở |
| `billing` | Thanh toán |
| `contract` | Hợp đồng |
| `maintenance` | Sửa chữa |
| `rules` | Nội quy |
| `facilities` | Tiện ích |
| `services` | Dịch vụ |
| `check_in_out` | Nhận/trả phòng |
| `other` | Khác |

#### Admin Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/admin/faqs` | Tạo FAQ | `question, answer, category, keywords, order` |
| **PATCH** | `/admin/faqs/:id` | Cập nhật FAQ | `question, answer, category, keywords, order, isActive` |
| **DELETE** | `/admin/faqs/:id` | Xóa FAQ | - |
| **GET** | `/admin/faqs/statistics` | Thống kê FAQ | - |

### 18.4 CHATBOT API

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/chatbot/search` | Tìm kiếm thông minh | `message` |

Response Chatbot:
```json
{
  "query": "cách đóng tiền phòng",
  "results": [...],
  "hasAnswer": true,
  "suggestion": null
}
```

### 18.5 FEEDBACK API (Đánh Giá Chất Lượng)

#### Student Routes

| Method | Endpoint | Mô Tả | Body Params |
|--------|----------|-------|-------------|
| **POST** | `/feedbacks` | Gửi đánh giá | `feedbackType, rating, title, comment, aspects, isAnonymous` |
| **GET** | `/feedbacks/my` | Đánh giá của tôi | `page, limit` |
| **GET** | `/feedbacks/:id` | Chi tiết đánh giá | - |

#### Feedback Types

| Type | Mô Tả |
|------|-------|
| `room_service` | Dịch vụ phòng |
| `maintenance` | Bảo trì/sửa chữa |
| `security` | An ninh/bảo vệ |
| `cleaning` | Vệ sinh |
| `staff_attitude` | Thái độ nhân viên |
| `facility` | Cơ sở vật chất |
| `billing` | Hóa đơn/thanh toán |
| `food` | Ăn uống |
| `laundry` | Giặt là |
| `general` | Chung |

#### Aspects (Tiêu chí đánh giá)

```json
{
  "cleanliness": 4,
  "staff_service": 5,
  "facilities": 4,
  "value_for_money": 5,
  "responsiveness": 4
}
```

#### Admin Routes

| Method | Endpoint | Mô Tả | Query Params |
|--------|----------|-------|--------------|
| **GET** | `/admin/feedbacks` | Tất cả đánh giá | `feedbackType, rating, isResolved, sentiment, page, limit` |
| **GET** | `/admin/feedbacks/statistics` | Thống kê | `startDate, endDate` |
| **GET** | `/admin/feedbacks/trend` | Xu hướng | `months` |
| **PATCH** | `/admin/feedbacks/:id/respond` | Phản hồi | `content` |
| **PATCH** | `/admin/feedbacks/:id/resolve` | Đánh dấu đã xử lý | `note` |

---

*Tài liệu được tạo tự động - Hệ thống Quản Lý Ký Túc Xá Thông Minh v1.0.0*
