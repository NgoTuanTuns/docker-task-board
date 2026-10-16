| Chỉ số                   | Naive  | Optimized | Chênh lệch                               |
| ------------------------ | ------ | --------- | ---------------------------------------- |
| Image size (disk usage)  | 1.66GB | 252MB     | giảm khoảng 85% (nhỏ hơn khoảng 6.6 lần) |
| Content size             | 415MB  | 62.7MB    | giảm khoảng 85%                          |
| Cold build (--no-cache)  | 4.3s   | 3.9s      | gần như không đổi                        |
| Rebuild sau khi sửa code | 3.7s   | 1.2s      | nhanh hơn khoảng 68% (khoảng 3 lần)      |
