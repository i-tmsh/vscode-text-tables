export const tableSizeRe = /^(\d+)x(\d+)$/u;

export function len(str: string) {
    return str.length;
}

export function lenB(str: string) {
    var result = 0;
    for (var i = 0; i < str.length; i++) {
        var chr = str.charCodeAt(i);
        if ((chr >= 0x00 && chr < 0x81) ||
            (chr === 0xf8f0) ||
            (chr >= 0xff61 && chr < 0xffa0) ||
            (chr >= 0xf8f1 && chr < 0xf8f4)) {
            //半角文字の場合は1を加算
            result += 1;
        } else {
            //それ以外の文字の場合は2を加算
            result += 2;
        }
    }
    //結果を返す
    return result;
};
