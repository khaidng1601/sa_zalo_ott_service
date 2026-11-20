# Kế hoạch tối ưu, APK và gọi 1–1

## 1. Phạm vi và tình trạng hiện tại

Kế hoạch này đối chiếu source hiện có với các chức năng trong ảnh: quản lý tài khoản/nhóm, chat 1–1 và nhóm với text/media/document/emotion, và thống kê hoạt động.

| Hạng mục | Hiện trạng theo source |
|---|---|
| Web | React 19 + TypeScript + MUI; đã có màn hình quản trị, danh bạ, chat, quản lý nhóm và thống kê. |
| Backend | NestJS + GraphQL/MongoDB; có xác thực JWT, phân quyền thành viên, lưu tin nhắn/media, thống kê và Socket.IO realtime. |
| Chat realtime | Đã có gateway xác thực JWT, typing/presence và sự kiện tin nhắn; chưa có signaling WebRTC/call. |
| Mobile/APK | `chatter-mobile` hiện không có source, `package.json` hay cấu hình app Android được Git theo dõi; vì vậy source hiện tại chưa thể tạo APK. |

`PLAN.md` có một số nội dung audit cũ không còn khớp source hiện tại (ví dụ ghi WebSocket/media chưa được cài đặt). Dùng tài liệu này làm kế hoạch phần mở rộng; trước khi triển khai, nên cập nhật riêng audit cũ để tránh nhầm trạng thái.

## 2. Có thể tối ưu thêm gì?

Đây là các điểm có bằng chứng trực tiếp trong code, chưa phải kết luận về hiệu năng khi chạy thực tế:

1. **Giảm truy vấn lặp ở thống kê nhóm:** `ActivitiesService.getSystemStats()` lấy tối đa 5 nhóm hoạt động rồi gọi `countDocuments()` tuần tự cho từng nhóm để đếm thành viên. Thay bằng một truy vấn tổng hợp theo `conversationId` (hoặc truy vấn `$in` có nhóm) và ghép kết quả trong bộ nhớ.
2. **Không tải toàn bộ hội thoại khi lấy thống kê cá nhân:** `getMyActivitySummary()` hiện đọc danh sách conversation rồi lọc theo membership trong ứng dụng. Có thể truy vấn trực tiếp các conversation thuộc danh sách ID thành viên đang hoạt động.
3. **Tránh tải lại toàn bộ danh sách hội thoại quá thường xuyên:** Dashboard hiện gọi lại `myConversations` mỗi khi nhận `conversation.updated`. Có thể cập nhật mục tương ứng khi event có đủ dữ liệu; vẫn giữ lần tải lại khi cần đồng bộ hoặc event không đủ thông tin.
4. **Đo trước khi tối ưu UI chat/media:** lịch sử tin nhắn hiện phân trang, nhưng cần đo kích thước DOM, thời gian tải ảnh/video, dung lượng bundle và thời gian render trước khi quyết định thêm virtual list, lazy loading hay thumbnail.

**Cách triển khai an toàn:** lấy baseline (thời gian phản hồi, số truy vấn, tải trang/render), thay từng điểm nhỏ, so sánh lại baseline và chạy test hiện hữu. Không đổi schema/API công khai nếu chưa chứng minh cần thiết.

## 3. Tạo APK

### Đánh giá

Chưa thể build APK từ repository hiện tại vì `chatter-mobile` không có source app hoặc manifest/build config được theo dõi. `chatter-ui` là ứng dụng web React, không tự tạo thành ứng dụng Android native chỉ bằng lệnh build hiện tại.

### Hướng đề xuất

**Ưu tiên: tạo app Android bằng Expo/React Native trong `chatter-mobile`.** App mới dùng chung backend GraphQL, upload REST và Socket.IO; không phụ thuộc giao diện web. Đây là hướng phù hợp hơn nếu cần quyền microphone/camera, nhận cuộc gọi và xử lý lifecycle trên mobile.

- Khởi tạo và commit đầy đủ Expo app, Android application ID, cấu hình môi trường API theo build profile, quyền microphone/camera và cấu hình deep link cho lời mời cuộc gọi.
- Thêm màn hình đăng nhập, danh bạ/conversation list, chat cơ bản và call UI theo từng giai đoạn; gọi backend qua HTTPS/WSS, không dùng URL `localhost` trong bản cài trên thiết bị.
- Tạo APK thử nghiệm bằng EAS Build (Android preview/internal distribution); cấu hình keystore/signing an toàn cho bản release. Có thể build local bằng Android SDK/JDK/Gradle sau khi dự án native đã được tạo.
- Kiểm tra APK trên thiết bị thật: đăng nhập, chat, upload/download, xin quyền camera/microphone, chuyển Wi-Fi/4G và nhận/kết thúc cuộc gọi.

**Phương án nhanh nhưng giới hạn:** đóng gói web bằng PWA/TWA hoặc Capacitor. Có thể tái sử dụng một phần giao diện web, nhưng vẫn cần cấu hình HTTPS/domain và kiểm thử quyền/lifecycle WebRTC trên thiết bị. Không nên chọn hướng này nếu yêu cầu nhận cuộc gọi ổn định khi app ở background.

## 4. Kế hoạch thêm gọi 1–1 cho web và mobile

**Trạng thái triển khai web:** backend đã có signaling namespace `/calls`, xác thực thành viên direct conversation, state machine cuộc gọi và TURN/STUN; giao diện React đã thêm nút gọi thoại/gọi video, màn hình incoming/outgoing, accept/reject/hangup và WebRTC audio/video. Cần build/test thực tế trên HTTPS để xác nhận end-to-end.

### Có thể làm mà không đổi logic chat hiện tại không?

Có thể thiết kế theo hướng **bổ sung độc lập**, không sửa hợp đồng GraphQL/tin nhắn hiện có và không chuyển media cuộc gọi qua backend. Tuy nhiên không thể cam kết rủi ro bằng 0; phần dùng chung như xác thực, membership, Socket.IO và UI vẫn cần regression test.

Giả định cho kế hoạch: cuộc gọi 1–1 có audio và video, chỉ giữa hai thành viên của direct conversation; chưa gồm group call, ghi âm/ghi hình hay lưu trữ nội dung media.

### Thiết kế đề xuất

1. **WebRTC cho media:** trình duyệt trao đổi audio/video trực tiếp bằng `RTCPeerConnection`. Backend chỉ chuyển tiếp signaling (offer/answer/ICE) qua Socket.IO; media stream không được lưu vào MongoDB hay đi qua GraphQL.
2. **CallModule/CallGateway tách biệt:** tạo gateway/namespace riêng trên cùng hạ tầng Socket.IO, tái sử dụng xác thực token nhưng không đổi event chat hiện tại. Chỉ thêm nút gọi và call panel tách biệt trong web chat.
3. **Kiểm tra quyền ở server:** trước khi gửi/nhận lời mời, xác thực người gọi/người nhận đang là hai thành viên active của đúng direct conversation; từ chối group, user ngoài cuộc trò chuyện, tài khoản bị disable, lời mời trùng và thao tác sai trạng thái.
4. **State cuộc gọi:** định nghĩa trạng thái tối thiểu `ringing → accepted → ended` cùng `rejected/cancelled/timeout`, xử lý một cuộc gọi đang hoạt động cho mỗi người dùng, disconnect, hết thời gian đổ chuông và kết thúc từ một trong hai phía. State ban đầu có thể ephemeral trong một backend instance; nếu chạy nhiều instance cần shared adapter/store (ví dụ Redis) và đồng bộ state.
5. **Kết nối mạng:** cấu hình STUN; cung cấp TURN cho các mạng NAT/firewall không thiết lập được kết nối peer-to-peer. Secrets/credentials TURN phải nằm trong cấu hình bảo mật, không commit vào source.
6. **HTTPS/WSS và quyền thiết bị:** browser cần secure context cho camera/microphone; xử lý user từ chối quyền, thiết bị không có camera/microphone, ICE failure, mất mạng và reconnect với thông báo rõ ràng.
7. **Mobile:** Expo app dùng cùng signaling contract, nhưng call UI, quyền native, trạng thái background/foreground và thông báo cuộc gọi đến cần kiểm thử/triển khai riêng. Source mobile hiện chưa có nên đây là đầu việc độc lập, không thể coi là tích hợp sẵn.
8. **Thống kê (tùy chọn):** nếu cần báo cáo cuộc gọi, chỉ ghi metadata tối thiểu như bắt đầu/kết thúc, thời lượng và kết quả; không ghi SDP, ICE credentials, audio/video hoặc nội dung nhạy cảm.

### Trình tự thực hiện

| Giai đoạn | Công việc | Tiêu chí hoàn thành |
|---|---|---|
| 0. Chốt phạm vi | Xác nhận audio+video, chỉ 1–1, chính sách cuộc gọi khi offline, timeout, TURN và có cần lịch sử/thống kê call không. | Có contract sự kiện và quyết định lưu hay không lưu call metadata. |
| 1. Baseline & test | Chạy test/build hiện có; thêm test bảo vệ luồng chat/realtime hiện hành trước khi thay đổi. | Có kết quả baseline và regression test hiện hữu chạy được. |
| 2. Tối ưu có đo lường | Sửa truy vấn thống kê lặp, lọc conversations theo membership, giảm refetch dashboard; đo lại. | Kết quả trả về không đổi; giảm truy vấn/tải thừa được đo xác nhận. |
| 3. Signaling backend | Thêm CallModule/gateway, state machine, kiểm tra JWT, membership và trạng thái cuộc gọi; cấu hình timeout/ICE/TURN. | Test cho lời mời hợp lệ, người ngoài cuộc, group, disabled user, reject/cancel/timeout/disconnect. Chat socket và GraphQL hiện tại không đổi contract. |
| 4. Web call | Thêm nút audio/video, màn hình đến/đi, accept/reject, mute/camera/hangup và cleanup track/socket khi đóng hoặc rời trang. | Hai trình duyệt gọi được trên HTTPS; lỗi quyền và ICE failure có UX rõ; chat tiếp tục hoạt động. |
| 5. Mobile & APK | Khởi tạo Expo app, tích hợp API/signaling và call UI native, xin quyền, build APK preview ký phù hợp. | Cài APK trên thiết bị Android và gọi hai chiều với web qua mạng khác nhau. |
| 6. Phát hành | Kiểm thử regression, bảo mật quyền signaling, cấu hình production TLS/TURN và hướng dẫn phát hành APK. | Web/mobile chat cũ không suy giảm; call failure/reconnect có hành vi xác định. |

## 5. Bộ kiểm thử bắt buộc trước khi coi là an toàn

- Đăng nhập, danh bạ, tạo direct/group conversation, text/media/document/emotion, phân trang, recall/reaction và thống kê vẫn hoạt động.
- Người không thuộc direct conversation không thể dò hoặc tham gia call; thành viên group không thể dùng event call 1–1 để gọi thành viên khác ngoài luồng đã cho phép.
- Kiểm thử hai tab/thiết bị cùng user, bấm gọi đồng thời, bên nhận bận, từ chối, timeout, mất mạng, refresh trang/app và disconnect.
- Kiểm thử browser permission denied, không có thiết bị, camera/microphone đang bị ứng dụng khác sử dụng, TURN relay và thiết bị Android thật.
- Chỉ triển khai production sau khi kiểm thử trên HTTPS/WSS và xác nhận cấu hình TURN hoạt động; localhost không đại diện cho môi trường production.
