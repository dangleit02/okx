export default () => ({
    coinsForBuy: [
        'AXS'     ,
        'STRK'    ,
        'WLD'     ,
        'DOT'     ,
        'NEAR'    ,
        'DOGS'    ,
        'AEVO'    ,
        'DYDX'    ,
        'OP'      ,
        'ENJ'     ,
        'ID'      ,
        'TNSR'    ,
        'ETHW'    ,
        'ORDI'    ,
        'PEOPLE'  ,
        'TIA'     ,
        'IMX'     ,
        'MLN'     ,
        'MEME'    ,
        'PYTH'    ,
        'PEPE'    ,
        'WIF'     ,
        'FLOKI'   ,
        'BONK'    ,
        'DOGE'    ,
        'BOME'    ,
        'BIO'     ,
        'POL'     ,
        'MAGIC'   ,
        'LDO'     ,
        'ARB'     ,
        'SHIB'    ,
        'ADA'     ,
    ],
    coinsForTakeProfit: [
        'AXS'     ,
        // 'STRK'    ,
        // 'WLD'     ,
        'DOT'     ,
        // 'NEAR'    ,
        'DOGS'    ,
        'AEVO'    ,
        'DYDX'    ,
        'OP'      ,
        'ENJ'     ,
        'ID'      ,
        'TNSR'    ,
        'ETHW'    ,
        'ORDI'    ,
        'PEOPLE'  ,
        'TIA'     ,
        'IMX'     ,
        'MLN'     ,
        // 'MEME'    ,
        'PYTH'    ,
        // 'PEPE'    ,
        'WIF'     ,
        'FLOKI'   ,
        // 'BONK'    ,
        // 'DOGE'    ,
        'BOME'    ,
        // 'BIO'     ,
        // 'POL'     ,
        'MAGIC'   ,
        'LDO'     ,
        'ARB'     ,
        // 'SHIB'    ,
        // 'ADA'     ,
       //  'XLM',
    ],
    coin: {
        AXS: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 2.678, // Giá hiện tại (USDT)
            minBuyPrice: 2.171, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 2.467, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.887, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 36.86406091, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 2.524, // Giá chốt lời (USDT)
            minTakeProfitPrice: 2.369, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 7.3835415, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 4.598, // Giá chốt lời (USDT)
            minTakeProfitPrice: 4.095, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 356181.0652, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.0001415, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.000131, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 70.94205526, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1002, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.0907, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 38.96880076, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.6592, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.5979, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 23.9760507, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.8075, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.7288, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 1186.547871, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.0709, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.0662, // Giá chốt lời (USDT)
        },
        ID: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1704, // Giá hiện tại (USDT)
            minBuyPrice: 0.1468, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1595, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.134, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 490.3821014, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1671, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1558, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 156.57493136, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1219, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1145, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 3.9782, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.6285, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.5482, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 1.3144866, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 10.286, // Giá chốt lời (USDT)
            minTakeProfitPrice: 9.234, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 708.32533239, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.02136, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.01968, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 45.2692456, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.784, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.654, // Giá chốt lời (USDT)
        },
        IMX: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.642, // Giá hiện tại (USDT)
            minBuyPrice: 0.451, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.565, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.333, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá,
            numberOfBoughtCoin: 47.711095, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.880, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.621, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 10.215972, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 8.11, // Giá chốt lời (USDT)
            minTakeProfitPrice: 7.65, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 74.19016, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.002684, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.002462, // Giá chốt lời (USDT)
        },
        PYTH: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1795, // Giá hiện tại (USDT)
            minBuyPrice: 0.1143, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1589, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0803, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 37.9624656, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1703, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1557, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 23.8659649, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.5183, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.4834, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 13.9528464, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.934, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.858, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 64117.612, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.00010015, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.00009281, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 264573.9716, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.00002482, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.00002246, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 3109.2288, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.002115, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.00193, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 29.79941124, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.2133, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1962, // Giá chốt lời (USDT)
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
            numberOfBoughtCoin: 14.986, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.3012, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.1484, // Giá chốt lời (USDT)
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
        ADA: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.6759, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.8499, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4967, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 22, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        XLM: {
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 1, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 18.88870559, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.3912, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.3735, // Giá chốt lời (USDT)
        },
    },
});
