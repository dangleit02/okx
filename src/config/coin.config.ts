export default () => ({
    coin: {
        AXS: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 2.678, // Giá hiện tại (USDT)
            minBuyPrice: 2.171, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 2.523, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.887, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        STRK: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1349, // Giá hiện tại (USDT)
            minBuyPrice: 0.1119, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1274, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0955, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        WLD: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.767, // Giá hiện tại (USDT)
            minBuyPrice: 0.76, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.161, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.562, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        DOT: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 4.225, // Giá hiện tại (USDT)
            minBuyPrice: 3.395, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 4.165, // Giá mua cao nhất (USDT)
            stopLossPrice: 2.965, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        NEAR: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 2.713, // Giá hiện tại (USDT)
            minBuyPrice: 2.129, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 2.55, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.789, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        DOGS: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.0001415, // Giá hiện tại (USDT)
            minBuyPrice: 0.0001217, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0001393, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0000981, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 7, // Số chữ số thập phân cho giá
        },
        AEVO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1002, // Giá hiện tại (USDT)
            minBuyPrice: 0.0786, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0925, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.067, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        DYDX: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.6455, // Giá hiện tại (USDT)
            minBuyPrice: 0.5464, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.6154, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4075, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        OP: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.7776, // Giá hiện tại (USDT)
            minBuyPrice: 0.6094, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.7477, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4329, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        ENJ: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.0701, // Giá hiện tại (USDT)
            minBuyPrice: 0.064, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0684, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0576, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 20, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        ID: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1704, // Giá hiện tại (USDT)
            minBuyPrice: 0.1468, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1649, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.134, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        TNSR: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1281, // Giá hiện tại (USDT)
            minBuyPrice: 0.1056, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1189, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0939, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        ETHW: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.6259, // Giá hiện tại (USDT)
            minBuyPrice: 1.4414, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.5847, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.9809, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        ORDI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 9.703, // Giá hiện tại (USDT)
            minBuyPrice: 7.479, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 9.532, // Giá mua cao nhất (USDT)
            stopLossPrice: 5.434, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        PEOPLE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.01972, // Giá hiện tại (USDT)
            minBuyPrice: 0.01568, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0209, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00954, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        TIA: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.861, // Giá hiện tại (USDT)
            minBuyPrice: 1.497, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.716, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.295, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        IMF: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.541, // Giá hiện tại (USDT)
            minBuyPrice: 0.451, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.565, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.333, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        MLN: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 8.23, // Giá hiện tại (USDT)
            minBuyPrice: 7.01, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 8.02, // Giá mua cao nhất (USDT)
            stopLossPrice: 6.52, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 20, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        MEME: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.002898, // Giá hiện tại (USDT)
            minBuyPrice: 0.001738, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.002586, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.001221, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
        },
        PYTH: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1795, // Giá hiện tại (USDT)
            minBuyPrice: 0.1143, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1465, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0803, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        PEPE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.00001194, // Giá hiện tại (USDT)
            minBuyPrice: 0.00000804, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00001046, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000495, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 9, // Số chữ số thập phân cho giá
        },
        WIF: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.973, // Giá hiện tại (USDT)
            minBuyPrice: 0.619, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.884, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.293, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        FLOKI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.00010645, // Giá hiện tại (USDT)
            minBuyPrice: 0.00005819, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00009661, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00004465, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 8, // Số chữ số thập phân cho giá
        },
        BONK: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.0000261, // Giá hiện tại (USDT)
            minBuyPrice: 0.0000111, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00002266, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000858, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 9, // Số chữ số thập phân cho giá
        },
        DOGE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.28917, // Giá hiện tại (USDT)
            minBuyPrice: 0.18681, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.24494, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.12619, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        BOME: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.002256, // Giá hiện tại (USDT)
            minBuyPrice: 0.001208, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.002012, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00088, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
        },
        BIO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1665, // Giá hiện tại (USDT)
            minBuyPrice: 0.096, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.151, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0399, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        POL: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.2833, // Giá hiện tại (USDT)
            minBuyPrice: 0.1893, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.2403, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.162, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        MAGIC: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.2161, // Giá hiện tại (USDT)
            minBuyPrice: 0.135, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.2076, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0642, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        LDO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.2701, // Giá hiện tại (USDT)
            minBuyPrice: 0.8364, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.1997, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.5999, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        ARB: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.5358, // Giá hiện tại (USDT)
            minBuyPrice: 0.3557, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.5067, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.2452, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        SHIB: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.00001377, // Giá hiện tại (USDT)
            minBuyPrice: 0.00001153, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00001275, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000989, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 9, // Số chữ số thập phân cho giá
        },
    },
});
