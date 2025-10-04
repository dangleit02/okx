export default () => ({
    coinsForBuy: [
        // TOP 100
        'BTC',
        'ETH',
        'XRP',
        'BNB',
        'SOL',
        'DOGE',
        'ADA',  
        'LINK',
        'AVAX',
        'XLM',
        'SUI',
        'BCH',
        'DOT',
        'UNI',
        'AAVE',
        'OKB',
        'PEPE',
        'WLD',
        'BONK',
        'PYTH',
        'PENDLE',
        'FLOKI',
        'WIF',
        // da mua   
        'APT'     ,
        'ENJ'     ,
        'MLN'    ,
        'DOGS'     ,
        'TNSR'     ,
        'AXS'    ,
        'STRK'    ,
        'TIA'    ,
        'SAND'      ,
        'SHIB'    ,
        'ID'      ,
        'POL'    ,
        'ARB'     ,
        'NEAR'    ,
        'IMX'    ,
        'DYDX'  ,
        'ETHW'     ,
        'PEOPLE'     ,
        'LDO',
        'MEME',
        'ORDI',
        // 'ULTI',
        'BOME',
        'OP',
        'AEVO',
        'SUSHI',
        '1INCH',
        'ALGO',
        'MAGIC',
        'ETC',
    ],
    coinsForTakeProfit: [
        'ENJ'     ,
        'APT'     ,
        'MLN'    ,
        'DOGS'     ,
        'TNSR'     ,
        'AXS'    ,
        'STRK'    ,
        'TIA'    ,
        'SHIB'    ,
        'SAND'      ,
        'ID'      ,
        'DOT',
        'POL'    ,
        'IMX'    ,
        'NEAR'    ,
        'DYDX'  ,
        'ETHW'     ,
        'PEOPLE'     ,
        'ARB'     ,
    ],
    coin: {
        AXS: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 2.678, // Giá hiện tại (USDT)
            minBuyPrice: 1.844, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 2.129, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.726, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 27.30434391, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 2.524, // Giá chốt lời (USDT)
            minTakeProfitPrice: 2.369, // Giá chốt lời (USDT)
        },
        STRK: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1349, // Giá hiện tại (USDT)
            minBuyPrice: 0.1092, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1168, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0955, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
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
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        DOT: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 4.225, // Giá hiện tại (USDT)
            minBuyPrice: 3.582, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 3.867, // Giá mua cao nhất (USDT)
            stopLossPrice: 2.995, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 7.3835415, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 4.598, // Giá chốt lời (USDT)
            minTakeProfitPrice: 4.095, // Giá chốt lời (USDT)
        },
        NEAR: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 2.713, // Giá hiện tại (USDT)
            minBuyPrice: 2.438, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 2.763, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.789, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 8, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        DOGS: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.0001415, // Giá hiện tại (USDT)
            minBuyPrice: 0.0001093, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0001211, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0001038, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 7, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 311717.9202, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.0001415, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.000131, // Giá chốt lời (USDT)
        },
        AEVO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.1002, // Giá hiện tại (USDT)
            minBuyPrice: 0.0786, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0951, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.067, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 70.94205526, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1029, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.0907, // Giá chốt lời (USDT)
        },
        DYDX: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.6455, // Giá hiện tại (USDT)
            minBuyPrice: 0.5323, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.5786, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4075, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 38.96880076, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.6336, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.5979, // Giá chốt lời (USDT)
        },
        OP: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.7776, // Giá hiện tại (USDT)
            minBuyPrice: 0.471, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.5993, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4075, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 23.9760507, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.8075, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.7288, // Giá chốt lời (USDT)
        },
        ENJ: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.0701, // Giá hiện tại (USDT)
            minBuyPrice: 0.0562, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0604, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0545, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 1186.547871, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.0709, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.0662, // Giá chốt lời (USDT)
        },
        ID: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1704, // Giá hiện tại (USDT)
            minBuyPrice: 0.1313, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1471, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.1249, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 490.3821014, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1635, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1558, // Giá chốt lời (USDT)
        },
        TNSR: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1281, // Giá hiện tại (USDT)
            minBuyPrice: 0.0789, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.0990, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0746, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 617.38213136, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1219, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1145, // Giá chốt lời (USDT)
        },
        ETHW: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.6259, // Giá hiện tại (USDT)
            minBuyPrice: 1.2518, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.4915, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.9809, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 3.9782, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.6285, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.5482, // Giá chốt lời (USDT)
        },
        ETHFI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.6259, // Giá hiện tại (USDT)
            minBuyPrice: 0.968, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.465, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 3.9782, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.6285, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.5482, // Giá chốt lời (USDT)
        },
        ORDI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 9.703, // Giá hiện tại (USDT)
            minBuyPrice: 8.058, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 8.576, // Giá mua cao nhất (USDT)
            stopLossPrice: 5.434, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 1.3144866, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 10.286, // Giá chốt lời (USDT)
            minTakeProfitPrice: 9.234, // Giá chốt lời (USDT)
        },
        PEOPLE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.01972, // Giá hiện tại (USDT)
            minBuyPrice: 0.01198, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.01708, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00954, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 708.32533239, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.02136, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.01968, // Giá chốt lời (USDT)
        },
        TIA: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.861, // Giá hiện tại (USDT)
            minBuyPrice: 1.207, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.435, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.127, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 45.2692456, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.784, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.654, // Giá chốt lời (USDT)
        },
        IMX: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.642, // Giá hiện tại (USDT)
            minBuyPrice: 0.482, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.574, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.333, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá,
            numberOfBoughtCoin: 40.42689, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.905, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.715, // Giá chốt lời (USDT)
        },
        MLN: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 8.23, // Giá hiện tại (USDT)
            minBuyPrice: 6.56, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 7.17, // Giá mua cao nhất (USDT)
            stopLossPrice: 6.36, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 6.498015, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 8.11, // Giá chốt lời (USDT)
            minTakeProfitPrice: 7.65, // Giá chốt lời (USDT)
        },
        MEME: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.002898, // Giá hiện tại (USDT)
            minBuyPrice: 0.001738, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.002544, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.001221, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 74.19016, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.002684, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.002462, // Giá chốt lời (USDT)
        },
        PYTH: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1795, // Giá hiện tại (USDT)
            minBuyPrice: 0.1022, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1555, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0803, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 37.9624656, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.1703, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1557, // Giá chốt lời (USDT)
        },
        ARB: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.4693, // Giá hiện tại (USDT)
            minBuyPrice: 0.3142, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.4295, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.2452, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 23.8659649, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.5183, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.4834, // Giá chốt lời (USDT)
        },
        PEPE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.00001194, // Giá hiện tại (USDT)
            minBuyPrice: 0.00000866, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00001001, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000514, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 9, // Số chữ số thập phân cho giá
        },
        WIF: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.973, // Giá hiện tại (USDT)
            minBuyPrice: 0.696, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.834, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.293, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 13.9528464, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.934, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.858, // Giá chốt lời (USDT)
        },
        FLOKI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.00010645, // Giá hiện tại (USDT)
            minBuyPrice: 0.00007602, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00009010, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00004534, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 8, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 64117.612, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.00010015, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.00009281, // Giá chốt lời (USDT)
        },
        BONK: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.0000261, // Giá hiện tại (USDT)
            minBuyPrice: 0.00001808, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00002120, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000858, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
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
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        BOME: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.002256, // Giá hiện tại (USDT)
            minBuyPrice: 0.001528, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.001862, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00088, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 3109.2288, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.002115, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.00193, // Giá chốt lời (USDT)
        },
        BIO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.1665, // Giá hiện tại (USDT)
            minBuyPrice: 0.1153, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1615, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0399, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
        },
        POL: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.2833, // Giá hiện tại (USDT)
            minBuyPrice: 0.2035, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.2186, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.162, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 2, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        MAGIC: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.2161, // Giá hiện tại (USDT)
            minBuyPrice: 0.1008, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1936, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.0642, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 29.79941124, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.2133, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.1962, // Giá chốt lời (USDT)
        },
        LDO: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 1.2701, // Giá hiện tại (USDT)
            minBuyPrice: 0.999, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 1.1761, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.5999, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 14.986, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 1.3012, // Giá chốt lời (USDT)
            minTakeProfitPrice: 1.1484, // Giá chốt lời (USDT)
        },
        SHIB: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.00001377, // Giá hiện tại (USDT)
            minBuyPrice: 0.00001115, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.00001177, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.00000989, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 9, // Số chữ số thập phân cho giá
        },
        ADA: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.6759, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.8499, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.4967, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        XLM: {
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            addForTriggerPrice: 0.00001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 5, // Số chữ số thập phân cho giá
            numberOfBoughtCoin: 18.88870559, // Số lương coin đang sở hữu
            maxTakeProfitPrice: 0.3912, // Giá chốt lời (USDT)
            minTakeProfitPrice: 0.3735, // Giá chốt lời (USDT)
        },
        UNI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 8.28, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 9.36, // Giá mua cao nhất (USDT)
            stopLossPrice: 4.515, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 22, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        SUI: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 2.5813, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 3.4365, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.7013, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        PENDLE: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 4.003, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 4.974, // Giá mua cao nhất (USDT)
            stopLossPrice: 1.833, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 3, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        YGG: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.1441, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.1727, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.1233, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 5, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        APT: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 3.680, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 4.049, // Giá mua cao nhất (USDT)
            stopLossPrice: 3.538, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 4, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá
        },
        ZENT: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.008497, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.010565, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.006882, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 0, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
        },
        '1INCH': {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.1854, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.2451, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.1534, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.000001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 6, // Số chữ số thập phân cho giá
        },
        SAND: {
            maxUsdt: 1500, // Số tiền tối đa để đầu tư cho mỗi coin (USDT)
            // currentPrice: 0.8589, // Giá hiện tại (USDT)
            minBuyPrice: 0.2436, // Giá mua thấp nhất (USDT)
            maxBuyPrice: 0.2625, // Giá mua cao nhất (USDT)
            stopLossPrice: 0.2148, // Giá dừng lỗ (USDT)
            amountOfUsdtPerStep: 12, // Số tiền đầu tư mỗi bước (USDT), must greater than 10
            riskPerTrade: 0.02, // Tỷ lệ rủi ro trên mỗi giao dịch (2%)
            addForTriggerPrice: 0.0001, // Đơn vị giá để tính giá kích hoạt
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá
        },
        BTC: {
            szToFixed: 7, // Số chữ số thập phân cho khối lượng
            priceToFixed: 1, // Số chữ số thập phân cho giá            
        },
        ETH: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá            
        },
        XRP: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá            
        },
        BNB: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 1, // Số chữ số thập phân cho giá            
        },
        SOL: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá 
        },
        LINK: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá 
        },
        AVAX: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 3, // Số chữ số thập phân cho giá 
        },
        BCH: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 1, // Số chữ số thập phân cho giá 
        },
        AAVE: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá 
        },
        OKB: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá 
        },   
        SUSHI: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 4, // Số chữ số thập phân cho giá 
        },   
        ALGO: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá 
        },
        ETC: {
            szToFixed: 6, // Số chữ số thập phân cho khối lượng
            priceToFixed: 2, // Số chữ số thập phân cho giá 
        },
    },
});
