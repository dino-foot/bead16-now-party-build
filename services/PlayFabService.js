const PLAYFAB_TITLE_ID = "1979DB";
const PLAYFAB_SECRET_KEY = "KOJOCCBK58YTFAB8BYDPGHF7CIUD4ZU58GEKBPK8XYWP6DEGDJ";
const COIN_CURRENCY_CODE = "CO"; // matches Unity's ConstantData.CoinCode
export class PlayFabService {
    static async addVirtualCurrency(playfabId, amount) {
        const res = await fetch(`https://${PLAYFAB_TITLE_ID}.playfabapi.com/Server/AddUserVirtualCurrency`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SecretKey": PLAYFAB_SECRET_KEY ?? "",
            },
            body: JSON.stringify({
                PlayFabId: playfabId,
                VirtualCurrency: COIN_CURRENCY_CODE,
                Amount: amount,
            }),
        });
        const json = await res.json();
        if (!res.ok) {
            throw new Error(`PlayFab AddUserVirtualCurrency failed (${res.status}): ${json?.errorMessage ?? JSON.stringify(json)}`);
        }
    }
}
