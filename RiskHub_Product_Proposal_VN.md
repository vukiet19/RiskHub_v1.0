# RiskHub Product Proposal

> Tài liệu này được viết dựa trên trạng thái sản phẩm hiện có trong codebase ngày 19/04/2026. Nội dung ưu tiên các tính năng đã được hiện thực thay vì mô tả theo định hướng lý tưởng trong PRD.

## 1. Tóm tắt đề xuất

**RiskHub** là nền tảng **read-only risk intelligence** dành cho trader crypto hoạt động trên nhiều sàn tập trung. Thay vì giúp người dùng giao dịch nhiều hơn, RiskHub giúp họ **thấy rõ rủi ro hơn, kỷ luật hơn và ra quyết định tỉnh táo hơn**.

Sản phẩm hiện tại tập trung vào 5 năng lực cốt lõi:

- Kết nối dữ liệu giao dịch đa sàn theo mô hình chỉ đọc
- Tổng hợp portfolio live theo từng sàn và toàn bộ danh mục
- Phát hiện hành vi giao dịch rủi ro bằng Behavioral Quant Engine
- Cảnh báo rủi ro theo thời gian thực và lưu vết để truy xuất
- Xây dựng hồ sơ Risk Identity phiên bản hóa, sẵn sàng cho lớp xác thực Web3/SBT trong giai đoạn tiếp theo

**Định vị đề xuất:**  
RiskHub không phải là một công cụ trade execution hay một ví lưu ký. Đây là **lớp bảo vệ rủi ro, lớp phân tích hành vi và lớp uy tín giao dịch** dành cho nhà đầu tư crypto hiện đại.

## 2. Bài toán thị trường

Trader crypto cá nhân đang gặp ba vấn đề lớn:

1. **Rủi ro bị phân mảnh giữa nhiều sàn**
   Spot, futures, PnL chưa chốt, đòn bẩy và vị thế mở thường nằm rải rác trên nhiều exchange. Người dùng rất khó nhìn ra tổng thể rủi ro thực.

2. **Hành vi giao dịch cảm tính không được cảnh báo đúng lúc**
   Các pattern như revenge trading, overtrading, dùng đòn bẩy quá mức hoặc tập trung quá nhiều vào một tài sản thường chỉ được nhận ra sau khi tài khoản đã chịu drawdown.

3. **Thiếu hồ sơ uy tín giao dịch có thể kiểm chứng**
   Trong copy trading và signal market, phần lớn “thành tích” được chia sẻ bằng ảnh chụp màn hình hoặc số liệu chọn lọc. Người theo dõi gần như không có công cụ để xác minh kỷ luật và mức độ rủi ro thật sự của một trader.

## 3. Giải pháp RiskHub

RiskHub giải quyết bài toán trên bằng một nền tảng phân tích rủi ro end-to-end:

- Kết nối tài khoản exchange bằng API **read-only**
- Đồng bộ lịch sử giao dịch và ảnh chụp live exposure
- Tính toán các chỉ số hành vi và chỉ số rủi ro trên backend
- Đẩy cảnh báo realtime đến giao diện người dùng
- Trực quan hóa contagion risk giữa các tài sản trong danh mục
- Tạo hồ sơ Risk Identity có lịch sử phiên bản để phục vụ chia sẻ, đối chiếu và mở rộng sang mô hình xác thực Web3

## 4. Những gì sản phẩm hiện tại đã có

### 4.1. Kết nối đa sàn theo mô hình read-only

RiskHub hiện đã hỗ trợ:

- **Binance** và **OKX**
- Môi trường **mainnet**, **testnet**, và **Binance demo**
- Quản lý nhiều kết nối theo từng sàn, môi trường và market type
- Lưu trữ credential theo cơ chế **AES-256-GCM ở tầng ứng dụng**
- Xác thực kết nối trước khi lưu
- Theo dõi trạng thái đồng bộ, lỗi sync và thời điểm sync gần nhất

Giá trị mang lại:

- Người dùng không cần chuyển tài sản hay cấp quyền giao dịch
- Hệ thống chỉ đọc dữ liệu tài khoản, không gọi các hành vi trade, withdraw hay transfer
- Tạo niềm tin cao hơn cho người dùng retail so với các mô hình custody hoặc semi-custody

### 4.2. Dashboard tổng hợp danh mục live

Màn hình `/dashboard` hiện đã có khả năng:

- Tổng hợp **Total Portfolio Value** trên toàn bộ kết nối
- Hiển thị giá trị danh mục theo từng sàn
- Hiển thị **spot assets** với định giá USD
- Hiển thị **open futures positions**, unrealized PnL, entry/mark price, leverage
- Hiển thị **discipline score**, **drawdown**, **net PnL**
- Hiển thị mức độ **freshness** của dữ liệu và các warning khi dữ liệu chưa đầy đủ
- Làm mới dashboard bằng dữ liệu lấy trực tiếp từ stored exchange keys
- Nhúng **Portfolio Contagion Map** vào trải nghiệm tổng quan

Giá trị mang lại:

- Người dùng có một “single risk view” thay vì phải mở nhiều app/sàn cùng lúc
- RiskHub đóng vai trò như một command center, không phải chỉ là một bảng số liệu rời rạc

### 4.3. Behavioral Quant Engine và kỷ luật giao dịch

Đây là phần có giá trị khác biệt mạnh nhất của RiskHub trong codebase hiện tại.

Backend hiện đang:

- Đọc lịch sử giao dịch trong cửa sổ 30 ngày
- Tính các chỉ số như:
  - Max drawdown
  - Win rate
  - Average / median / max leverage
  - Profit factor
  - Sharpe ratio
  - Total volume
  - Net PnL
  - Discipline score và discipline grade
- Đánh giá 5 luật hành vi MVP:
  - **RQ-001:** Revenge Trading
  - **RQ-002:** Overtrading
  - **RQ-003:** Excessive Leverage
  - **RQ-004:** Max Drawdown Breach
  - **RQ-005:** Concentration Risk
- Ghi snapshot vào `risk_metrics`
- Ghi sự kiện cảnh báo vào `alerts_log`

Giá trị mang lại:

- RiskHub không chỉ mô tả trạng thái tài khoản mà còn **đánh giá hành vi ra quyết định**
- Đây là nền tảng để sản phẩm bước sang lớp “behavioral identity” thay vì chỉ dừng ở “portfolio dashboard”

### 4.4. Alerting realtime và lịch sử cảnh báo có thể truy vết

Sản phẩm hiện có:

- WebSocket push alert theo từng user
- Recent alerts ngay trên dashboard
- Màn hình `/alert-history` chuyên dụng
- Bộ lọc theo:
  - ngày
  - severity
  - category
  - rule id
  - read/unread
  - exchange
  - search keyword
- Đánh dấu đã đọc theo từng alert hoặc toàn bộ tập lọc
- Truy xuất **related trades** để xem bằng chứng giao dịch gắn với alert

Giá trị mang lại:

- Biến alert từ một notification đơn lẻ thành một hệ thống audit trail
- Người dùng có thể quay lại xem tại sao cảnh báo được kích hoạt, chứ không chỉ nhận cảnh báo rồi bỏ qua

### 4.5. Advanced Risk Analysis

Màn hình `/risk-analysis` hiện đã vượt mức dashboard thông thường và đi vào lớp phân tích rủi ro chuyên sâu:

- Lọc theo **scope**: all, Binance, OKX
- Lọc theo **mode**: all, spot, future
- Tính **risk score tổng**
- Tách risk theo 4 hợp phần:
  - concentration
  - leverage
  - drawdown
  - contagion
- Liệt kê **top risk contributors**
- Phân tích từng vị thế có rủi ro cao
- Tạo **attention items** dưới dạng khuyến nghị hành động
- Chạy **stress scenarios** như:
  - BTC -20% shock
  - ETH -20% shock
  - Broad market -15% selloff
  - Dependency tightening / contagion stress

Giá trị mang lại:

- Đây là lớp từ “monitoring” đi sang “decision support”
- RiskHub không chỉ cho biết rủi ro đang cao, mà còn cho biết **rủi ro đến từ đâu** và **nếu thị trường xấu đi thì tác động ước tính là gì**

### 4.6. Contagion Graph cho danh mục tài sản

RiskHub đã có một correlation / contagion engine tương đối hoàn chỉnh:

- Dùng rolling correlation window 30 ngày
- So sánh với cửa sổ lùi 7 ngày để đo mức siết/lỏng dependency
- Tính **systemic score** cho từng node tài sản
- Tạo edge với band high / moderate / low
- Phân loại market regime:
  - calm
  - elevated
  - stress
- Trả về các thành phần:
  - largest cluster
  - systemic asset
  - top risk pair
  - network density
  - contagion insight

Giá trị mang lại:

- RiskHub nhìn rủi ro theo cấu trúc mạng lưới tài sản, không chỉ theo số dư từng coin
- Đây là một điểm khác biệt rất mạnh nếu pitch ở bối cảnh hackathon, Web3 analytics hoặc copy trading infrastructure

### 4.7. Risk Identity và SBT readiness layer

Màn hình `/sbt-identity` hiện cung cấp một lớp identity data rất đáng giá:

- Tạo **current risk profile** từ snapshot live hiện tại
- Sinh các thuộc tính như:
  - identity tier
  - risk level
  - discipline grade
  - leverage snapshot
  - top asset concentration
  - behavior flags summary
  - eligibility / blockers
- Lưu **saved profile** có version
- Xem lịch sử profile
- So sánh profile đã lưu với snapshot mới nhất
- Chọn một phiên bản profile làm nguồn cho identity issuance
- **Issue Demo Identity** từ dữ liệu risk profile

Lưu ý quan trọng về trạng thái hiện tại:

- Flow identity hiện tại là **demo issuance ở local state**
- Codebase hiện **chưa thể hiện một flow mint SBT on-chain production-ready**
- Tuy nhiên, lớp dữ liệu hồ sơ, versioning và eligibility đã đủ tốt để làm nền cho bước tích hợp smart contract trong giai đoạn tiếp theo

## 5. Khách hàng mục tiêu

### 5.1. Active retail trader

Đây là nhóm phù hợp nhất với trạng thái sản phẩm hiện tại:

- Giao dịch trên 2-5 sàn
- Dùng cả spot và futures
- Muốn một công cụ nhìn rủi ro tổng hợp nhưng không muốn giao quyền trade
- Có nhu cầu nâng cao kỷ luật và giảm drawdown

### 5.2. Signal provider / copy-trade leader

Nhóm này đặc biệt phù hợp với lớp identity:

- Có nhu cầu chứng minh kỷ luật giao dịch
- Muốn chia sẻ hồ sơ hiệu suất minh bạch hơn ảnh chụp PnL
- Có thể dùng RiskHub như lớp “trust infrastructure” để tăng uy tín

### 5.3. Copy-trade follower / community analyst

Dù chưa là flow hoàn chỉnh trong product hiện tại, đây là hướng mở rộng rất hợp lý:

- Kiểm tra hồ sơ risk của trader trước khi theo lệnh
- Giảm bất cân xứng thông tin trong thị trường signal/copy trade

## 6. Lợi thế cạnh tranh

RiskHub có 5 lợi thế rõ ràng:

1. **Read-only by design**
   Không custody, không trade execution, không withdrawal, giảm mạnh rào cản niềm tin.

2. **Tập trung vào hành vi chứ không chỉ số dư**
   Nhiều dashboard crypto chỉ hiển thị holdings; RiskHub đi xa hơn bằng việc lượng hóa discipline và bad trading patterns.

3. **Risk intelligence nhiều lớp**
   Từ dashboard live, alerting, lịch sử cảnh báo, stress test cho đến contagion graph.

4. **Identity layer gắn với dữ liệu thực**
   Phiên bản hiện tại đã có profile snapshot, history và compare flow, đủ để mở rộng sang verifiable credential.

5. **Phù hợp với thị trường copy-trade đầy nhiễu**
   Nếu phát triển tiếp đúng hướng, RiskHub có thể trở thành lớp xác thực uy tín cho trader thay vì chỉ là công cụ nội bộ.

## 7. Mô hình kinh doanh đề xuất

Dựa trên chức năng hiện tại, RiskHub có thể theo mô hình:

- **Freemium cho retail trader**
  Dashboard cơ bản, số lượng kết nối giới hạn, cảnh báo cơ bản.

- **Pro subscription**
  Risk analysis nâng cao, stress testing, alert history đầy đủ, profile versioning, identity sharing.

- **B2B / white-label**
  Cung cấp risk layer cho cộng đồng copy trade, quỹ nhỏ, desk OTC, hoặc sàn muốn thêm lớp quản trị rủi ro.

- **Identity verification services**
  Thu phí cho lớp profile verification, trust badge hoặc on-chain credential issuance trong tương lai.

## 8. Độ tin cậy triển khai

Sản phẩm hiện tại không chỉ là slide ý tưởng. Nó đã có nền tảng kỹ thuật rõ ràng:

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind
- **Backend:** FastAPI, WebSocket, Pandas
- **Data layer:** MongoDB qua Motor, Pydantic models
- **Exchange integration:** CCXT
- **Security:** Mã hóa credential bằng AES-256-GCM ở tầng ứng dụng

Các module chính đã xuất hiện thành route và màn hình thực tế:

- `/dashboard`
- `/risk-analysis`
- `/alert-history`
- `/sbt-identity`
- API cho exchange keys, dashboard, sync, risk analysis, identity, engine và websocket alerts

## 9. Trạng thái sản phẩm hiện tại

### 9.1. Đã có thể demo tốt

- Kết nối Binance và OKX
- Tải live balances, spot assets, open positions
- Tổng hợp dashboard đa sàn
- Tính toán discipline score và quant metrics
- Sinh alert và xem lịch sử alert
- Phân tích contagion và risk decomposition
- Lưu risk profile theo version
- Issue demo identity từ risk profile

### 9.2. Cần hoàn thiện để đi production / gọi vốn mạnh hơn

- User authentication hoàn chỉnh thay cho default user context
- Background scheduling cho sync và quant engine
- Notification đa kênh ngoài WebSocket
- Smart contract minting và wallet signing flow thực
- Multi-user governance, team account, audit log mức tổ chức
- Mở rộng thêm exchange ngoài Binance và OKX

## 10. Roadmap đề xuất

### Phase 1: Hoàn thiện MVP production

- Hoàn thiện auth và user onboarding
- Tự động hóa lịch sync / engine
- Tối ưu data freshness và quan sát lỗi
- Chuẩn hóa report / export cho người dùng

### Phase 2: Web3 identity thật sự

- Tích hợp wallet connect / SIWE
- Mint SBT on-chain
- Cơ chế revocation / refresh / proof update
- Public verification page cho trader profile

### Phase 3: B2B trust infrastructure

- API cho copy-trade platforms
- Shared risk dashboards cho cộng đồng và desk
- Team-level risk policies
- Reputation graph cho trader / leader / follower

## 11. Kết luận đề xuất

RiskHub có vị thế tốt để trở thành một nền tảng **risk operating system cho trader crypto**.

Điểm mạnh lớn nhất của sản phẩm không nằm ở việc “gom số dư từ nhiều sàn”, mà nằm ở việc kết hợp được ba lớp giá trị trong cùng một hệ thống:

- **Live portfolio visibility**
- **Behavioral risk intelligence**
- **Identity and trust layer**

Trong trạng thái hiện tại, RiskHub đã đủ mạnh để thuyết phục ở góc nhìn hackathon, prototype chiến lược, hoặc pre-seed product concept. Nếu đội ngũ tiếp tục hoàn thiện auth, automation và on-chain identity flow, sản phẩm có tiềm năng đi xa hơn thành một hạ tầng trust layer cho copy trading và social trading trong Web3.

