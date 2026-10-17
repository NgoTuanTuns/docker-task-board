# Bàn giao từ A sang B

**Đề tài:** Containers in Web Development and Deployment (Docker), môn Web Programming and Application
**Người bàn giao:** A (Ngô Tuấn Tú) &nbsp;|&nbsp; **Người nhận:** B (Võ Quốc Bảo)
**Ngày bàn giao:** 17/10/2026

Phần việc của A (Phase 1 và các chương 1, 2, 5, 6.1–6.4) đã xong. File này nêu **A đã làm gì**, **B cần biết gì để làm Phase 2**, và **B cần làm gì tiếp theo**.

---

## 1. Tóm tắt trạng thái

| Hạng mục | Trạng thái |
|---|---|
| Code Phase 1 (app + PostgreSQL + Docker + Compose) | Xong, chạy được bằng `docker compose up --build` |
| Chương 1, 2, 5, 6.1–6.4 | Xong, đã dán vào file Word chung (`Mid-term_report_1.docx`) |
| Hình vẽ (Figure 1.1, 2.1–2.6, 5.1–5.3, 6.1, 6.2) | Xong (PNG + SVG + script vẽ) |
| Screenshot và số liệu đo Docker | Xong, đã đặt tên và phân loại |
| List of Abbreviations | Đã làm cho chương 1, 2, 5 (chưa cập nhật chương 6) |
| References | Danh sách có 34 nguồn (IEEE), chưa dán vào Word, chưa kiểm tra hết link |
| Code Phase 2 (Redis, Nginx, scale, benchmark) | **Chưa làm (phần của B)** |
| Chương 3, 4, 6.5–6.8, 7, 8 | **Chưa viết (phần của B)** |

---

## 2. A đã làm gì (code Phase 1)

**Ứng dụng task board (Node.js, Express, Socket.IO):**
- Đăng ký, đăng nhập bằng JWT (hết hạn sau 8 giờ), mật khẩu băm bằng `bcryptjs`.
- Phân quyền hai vai trò `admin` và `member`: chỉ chủ board hoặc admin được xóa board (người khác nhận 403).
- CRUD board, column, task. Tạo board tự tạo 3 cột To Do, In Progress, Done trong một transaction. Chuyển task = đổi `column_id`.
- Real-time: mỗi thay đổi ghi vào DB rồi phát sự kiện Socket.IO tới "phòng" của board.
- `GET /health`: kiểm tra kết nối DB, trả `status`, `db`, và `host` (hostname container, dùng để chứng minh load balancing).
- Seed data khi khởi động, có khóa `pg_advisory_lock` nên nhiều replica khởi động cùng lúc thì chỉ một replica seed.
- Giao diện một file `app/public/index.html` (đăng nhập, chọn board, thêm, chuyển, xóa task, nhận sự kiện real-time, hiển thị "served by" và "live").

**Database (PostgreSQL 16):** 4 bảng `users`, `boards`, `columns`, `tasks`, khóa ngoại có `ON DELETE CASCADE` (riêng `assignee_id` là `SET NULL`), 2 index. Script tạo bảng ở `db/init.sql`.

**Docker:**
- `app/Dockerfile` (multi-stage, `node:22-alpine`, `npm ci --omit=dev`, chạy bằng user `node`, có `HEALTHCHECK`), `app/.dockerignore`.
- `docs/Dockerfile.naive`: bản baseline để so sánh.
- `docker-compose.yml`: service `app` và `db`, network `backend`, volume `pgdata`, healthcheck cho `db` (`pg_isready -h localhost`), `depends_on` với `service_healthy`, `restart: unless-stopped`.
- Cấu hình qua `.env` (có `.env.example`), `.gitignore` chặn `.env`.

**Kết quả đo (máy của A, một lần đo mỗi chỉ số):**

| Chỉ số | Baseline | Tối ưu |
|---|---|---|
| Image (disk usage / content size) | 1.66 GB / 415 MB | 252 MB / 62.7 MB |
| Cold build (`--no-cache`) | 4.3 s | 3.9 s |
| Rebuild sau khi sửa code | 3.7 s | 1.2 s |

Đã kiểm tra: app chạy bằng user `node`, cả hai container `healthy`, DB không publish cổng ra host, dữ liệu còn sau `docker compose down` rồi `up -d`.

---

## 3. Chạy thử Phase 1

```powershell
git clone <link repo>
cd docker-task-board
Copy-Item .env.example .env        # điền lại mật khẩu và JWT_SECRET nếu muốn
docker compose up --build
```

Mở `http://localhost:3000`.

| Tài khoản demo | Mật khẩu | Vai trò |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `user1@example.com` | `user123` | member |
| `user2@example.com` | `user123` | member |

Kiểm tra nhanh: `curl.exe http://localhost:3000/health` trả `{"status":"ok","db":"up","host":"..."}`.

Nếu admin lỡ xóa `Demo Board`: `docker compose restart app` để seed lại (seed chỉ chạy khi bảng `boards` trống). Reset hoàn toàn: `docker compose down -v` rồi `up --build`.

---

## 4. Những điều B cần biết để làm Phase 2

### 4.1 "Hợp đồng" kỹ thuật

| Mục | Giá trị |
|---|---|
| Cổng app | `PORT` trong `.env` (mặc định 3000) |
| Biến môi trường | `PORT`, `NODE_ENV`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (host là `db`), `REDIS_URL` (đã có sẵn trong `.env.example`, chưa dùng), `JWT_SECRET` |
| Health check | `GET /health`, trả 503 khi DB không kết nối được |
| App stateless | Không giữ session trong bộ nhớ, xác thực bằng JWT |
| Network | `backend` (user-defined bridge); service gọi nhau bằng tên (`db`, `redis`...) |

### 4.2 Socket.IO (B sẽ gắn Redis adapter vào đây)

- Đối tượng `io` tạo ở `app/server.js` (`new Server(server)`). Thêm adapter ngay sau đó; code `io.to(...).emit(...)` ở `routes.js` **không cần sửa**.
- Xác thực: client gửi token trong `auth.token` lúc handshake, server kiểm bằng `jwt.verify`.
- Phòng: `board:<id>`. Client phát `board:join` và `board:leave` với `boardId`.
- Sự kiện server phát: `task:created`, `task:updated`, `task:deleted`, `column:created`, `column:deleted`.
- Client khi nhận bất kỳ sự kiện nào thì tải lại board bằng `GET /api/boards/:id`.
- Client dùng `io({ auth: { token }, transports: ['websocket'] })`, chỉ WebSocket nên **không cần sticky session** khi có nhiều replica. Giữ nguyên cấu hình này.

### 4.3 Chỗ phải sửa trong `docker-compose.yml`

1. **Bỏ `ports` của service `app`.** Mapping cổng cố định ngăn việc chạy nhiều replica (`--scale app=3` sẽ báo trùng cổng). Chỉ Nginx publish cổng.
2. Thêm service `redis` (healthcheck `redis-cli ping`, không publish cổng) và `nginx` (mount cấu hình từ `nginx/`, `depends_on` app).
3. Cấu hình Nginx cần hỗ trợ WebSocket (`proxy_http_version 1.1`, header `Upgrade` và `Connection`).
4. Docker DNS trả về các replica của `app`, nhưng **Nginx cache DNS lúc khởi động**: sau khi scale cần restart Nginx hoặc dùng `resolver 127.0.0.11` kèm biến trong `proxy_pass`.
5. Không đặt `container_name` cho `app` (cũng làm hỏng việc scale).
6. Thêm thư viện Redis và adapter vào `app/package.json` (`npm install` rồi commit cả `package-lock.json`), sau đó `docker compose up --build`.
7. Giữ nguyên các thiết lập đã có của `db` và `app` (healthcheck, `depends_on`, `restart`, network), báo A nếu muốn đổi.

### 4.4 Các lỗi A đã gặp, B nên tránh

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| `relation "users" does not exist` | `init.sql` chỉ chạy khi volume trống: `docker compose down -v` rồi `up --build` |
| Đổi mật khẩu DB trong `.env` mà vẫn lỗi đăng nhập | Postgres chỉ đọc biến môi trường lúc khởi tạo lần đầu: `down -v` |
| App báo `ECONNREFUSED` tới DB | `DATABASE_URL` phải dùng host `db`, không phải `localhost` |
| `NODE_ENV` trong container khác Dockerfile | Biến trong `.env` (qua `env_file`) ghi đè `ENV` của Dockerfile |
| `Cannot find module ...` sau khi thêm thư viện | Quên `--build` |
| `COPY . .` ghi đè `node_modules` | Thiếu `node_modules` trong `.dockerignore` |
| Healthcheck DB báo healthy quá sớm | Dùng `pg_isready -h localhost` (đã sửa) |

---

## 5. Báo cáo: A đã viết gì

Các chương dưới đây đã có trong `Mid-term_report_1.docx` (trích dẫn trong văn bản đã bỏ theo yêu cầu).

| Chương | Nội dung | Ghi chú cho B |
|---|---|---|
| 1 | Introduction | Mục 1.4 nhắc Redis, Nginx, replica: xác nhận khi Phase 2 xong |
| 2 | Theoretical Background (2.1–2.8) | Có 6 hình, 5 bảng; Section 6.2 được tham chiếu ở cuối 2.4 |
| 5 | Requirement Analysis and System Design | **Mô tả Phase 2 là thiết kế dự kiến, B cần xác nhận hoặc sửa** (mục 7 dưới đây) |
| 6.1–6.4 | Project Structure, Containerizing, Compose, Configuration and Secrets | Có số đo và screenshot thật; B viết tiếp 6.5–6.8 |

Cách viết cần giữ nhất quán ở phần của B: tiếng Anh, giọng văn như các chương đã có, mỗi 1–1.5 trang có hình hoặc bảng, ít bullet, trích code không quá 15 dòng và có giải thích. Từ viết tắt phải viết đầy đủ ở lần đầu (xem `Abbreviations.md`).

**Cách đặt tên và đánh số hình, bảng:** các chương của A dùng Figure 1.1, 2.1–2.6, 5.1–5.3, 6.1–6.5; Table 2.1–2.5, 5.1–5.6, 6.1–6.5. Phần của B bắt đầu từ Figure 6.6 (hoặc dùng Insert Caption của Word để số tự cập nhật).

---

## 6. Tệp và tài liệu A gửi kèm

| Tệp / thư mục | Nội dung |
|---|---|
| Repo `docker-task-board` (nhánh `phase1`) | Toàn bộ code Phase 1 |
| `Mid-term_report_1.docx` | Báo cáo chung hiện tại |
| `References.md` | 34 nguồn, xếp theo chữ cái, ghi chú kiểm chứng ở cuối |
| `Abbreviations.md` | Danh sách từ viết tắt cho chương 1, 2, 5 |
| `chapter2_figures/`, `chapter5_figures/`, `chapter6_figures/` | Hình A vẽ (PNG, SVG, script `.py`) và screenshot Figure 6.3–6.5 |
| `screenshots/ui_task_board_user1.png` | Ảnh giao diện, **dùng cho mục 7.1 của B** |
| `screenshots/evidence_build_time_*.png` | Bằng chứng đo thời gian build (không cần đưa vào báo cáo) |
| `docs/Dockerfile.naive` | Baseline Dockerfile |

Các hình của B (Nginx, Redis, sequence real-time, benchmark) B tự vẽ; có thể dùng lại phong cách của các script `.py` (matplotlib) cho đồng bộ.

---

## 7. B cần làm tiếp

**Code:**
- [ ] Redis + Socket.IO Redis adapter (đồng bộ real-time giữa các replica).
- [ ] Nginx reverse proxy và load balancing (có WebSocket), chỉ Nginx publish cổng.
- [ ] `docker compose up --build --scale app=3`, chứng minh load balancing bằng trường `host` của `/health` hoặc hiển thị "served by" trên giao diện.
- [ ] Kiểm tra: hai trình duyệt trên hai replica khác nhau vẫn đồng bộ; `docker stop` một replica, hệ thống vẫn phục vụ.
- [ ] Benchmark 1 replica so với 3 replica (k6, wrk hoặc ab): req/s, độ trễ trung bình và p95, tỷ lệ lỗi.
- [ ] (Bonus) Kubernetes hoặc GitHub Actions nếu còn thời gian; nếu không làm thì ghi rõ trong báo cáo.
- [ ] Gửi A cách chạy scale và test real-time để A cập nhật README và Appendix.

**Báo cáo:**
- [ ] Chương 3 (Container Orchestration and Scalability), Chương 4 (Comparative Analysis, ít nhất 4 bảng so sánh).
- [ ] Mục 6.5–6.8 (Nginx, Redis real-time, scaling với Compose, K8s/CI nếu có).
- [ ] Chương 7 (Results and Evaluation), Chương 8 (Conclusion and Future Work).
- [ ] References (gộp nguồn của cả hai phần, kiểm tra link) và cập nhật Abbreviations cho các chương mới.
- [ ] Chỉnh format theo template khoa, tạo mục lục, List of Figures, List of Tables; soát chính tả tiếng Anh toàn bộ.

**Các chỗ trong chương của A cần B xác nhận khi Phase 2 xong:**
- Chương 5: image và phiên bản của Nginx và Redis (Bảng 5.4, 5.6), cổng public của Nginx, số replica dùng khi demo, việc dùng Socket.IO Redis adapter và transport WebSocket (mục 5.4), healthcheck Redis.
- Chương 1, mục 1.4: mô tả Redis, Nginx và Compose có đúng với những gì đã làm không, và câu "Docker Swarm and Kubernetes are discussed conceptually" có đúng không (phụ thuộc B có làm K8s hay không).
- Các tham chiếu chéo Section 6.2, 6.3, 6.5, 6.6, 6.7 và Chapter 3, 4, 7 phải khớp số mục thật.

---

## 8. Việc cần sửa trong file Word chung (còn sót từ template cũ)

File `Mid-term_report_1.docx` còn các lỗi sau, cần sửa trước khi nộp:

| Chỗ | Vấn đề |
|---|---|
| Trang tiêu đề (sau Declaration, trước Abstract) | Vẫn ghi **"BUILDING A BOOKS MANAGEMENT AND ORDERING SYSTEM ON THE MERN STACK PLATFORM"**; phải đổi thành tên đề tài (Containers in Web Development and Deployment (Docker)) |
| Acknowledgement | Câu nhắc đề tài "Building a book management and ordering system on the MERN stack platform" |
| Acknowledgement, Declaration | Ngày ghi **3rd September 2023**; sửa thành ngày thật |
| Bìa | "WEB PROGRAMING AND APLICATION" viết sai chính tả (programming, application) |
| Abstract | Đang để trống |
| Chương 3 và 4 | Mới có tiêu đề, chưa có nội dung |
| Mục lục | Chưa có 6.5–6.8, Chương 7, 8, References, Appendix |
| References | Chưa dán vào báo cáo |
| Appendix | Chưa có (cấu trúc repo, lệnh chạy, tài khoản demo) |

Phần Declaration có câu "sử dụng dữ liệu của các tác giả khác với trích dẫn và nguồn" nên nếu báo cáo không có trích dẫn trong văn bản thì danh sách References càng cần đầy đủ và chính xác.

---

## 9. Quy ước làm việc

- Mỗi người commit lên repo chung (A: `phase1`, B: `phase2`), xong thì merge vào `main`; đây là bằng chứng đóng góp mà đề yêu cầu.
- Cả hai cần xuất hiện và nói trong video (tối đa 20 phút). A nói lý thuyết Docker và demo containerize; B nói orchestration, demo scale, benchmark, kết luận.
- Nộp trước hạn ít nhất 1 ngày (nộp trễ bị trừ điểm).
- Trước khi nộp: hai người review chéo phần của nhau (tiếng Anh, độ chính xác kỹ thuật, thuật ngữ nhất quán), test README trên máy sạch.
- Có vấn đề gì với phần Phase 1 thì báo A, đừng sửa thẳng các thiết lập Docker/Compose đã có mà không báo.
