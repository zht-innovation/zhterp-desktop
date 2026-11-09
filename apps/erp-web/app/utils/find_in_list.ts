export default function <T>(list: T[], key_val_pair: object) {
    // 在list中找到key_val_pair中的key和value都匹配的项
    for (let i = 0; i < list.length; i++) {
        let item = list[i];
        let match = true;
        for (let key in key_val_pair) {
            if (item[key] !== key_val_pair[key]) {
                match = false;
                break;
            }
        }
        if (match) {
            return {
                index: i,
                item: item
            };
        }
    }
    // 没有找到匹配的项
    return null;
}
