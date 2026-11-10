# 측정값 판정 앱

KTX 전기 점검 측정값을 넣으면 정상·주의·이상을 색으로 보여 주고, 차량·위치별로 기록해 추이를 보는 앱입니다.
인터넷 없이 동작하고, 기준값과 기록은 기기 안(IndexedDB)에만 저장합니다. 밖으로 보내는 기능은 없습니다.

## 파일
- `index.html` 앱 전체 (외부 라이브러리 없음)
- `sw.js` 오프라인 캐시 (앱 파일만, 데이터는 캐시하지 않음)
- `manifest.webmanifest`, `icon.svg` 홈 화면 설치용

## 기준값 파일 형식 (.json)
매뉴얼 기준값은 이 형식의 파일로 앱에 불러옵니다. **실제 기준값 파일은 보안 자료라서 이 저장소에 올리지 않습니다.**

```json
{
  "format": "ktx-meas-standards",
  "version": 1,
  "title": "견인전동기 정비 매뉴얼 기준값",
  "created": "2026-11-02",
  "notes": "추출 메모",
  "images": {"p45-1": "data:image/jpeg;base64,..."},  // 매뉴얼에서 꺼낸 사진. 여러 항목이 같은 사진을 같이 쓸 수 있음
  "items": [
    {
      "id": "tm-ir",                 // 고유 이름. 같은 id로 다시 불러오면 바뀐 값만 갱신
      "name": "견인전동기 절연저항",
      "group": "견인전동기",          // 분류 (목록 묶음)
      "method": "ir_temp",           // 판정 방법 (아래 표)
      "unit": "MΩ",                  // 측정값 단위
      "normal":  {"min": 10},         // 정상 범위 (min/max 중 필요한 것만)
      "caution": {"min": 1},          // 주의 범위 (정상 범위를 감싸야 함, 없으면 생략)
      "params": {"refTemp": 20, "halveEvery": 10},
      "points": ["1번", "2번", "3번", "4번"],   // 측정 위치 목록
      "where": "단자함 U·V·W 단자와 프레임 사이",  // 측정 부위 설명
      "howto": ["차단기 OFF, 접지 확인", "메거 DC 1000V로 1분 측정"],  // 측정 순서
      "images": [{"ref": "p45-1", "caption": "단자함 위치", "page": "45"}],  // 사진 (아래 images 표를 가리킴) 또는 {"src": "data:image/jpeg;base64,..."}
      "condition": "DC 1000V 메거, 1분값",
      "note": "",
      "source": {"doc": "매뉴얼 이름", "page": "45", "quote": "매뉴얼 원문 그대로"},
      "reviewed": false               // 사용자가 원문과 대조해 확인했는지
    }
  ]
}
```

| method | 뜻 | 판정하는 값 | params |
|---|---|---|---|
| `direct` | 측정값 그대로 | 측정값 (unit) | — |
| `ir_temp` | 절연저항 온도 보정 | 기준온도 환산값 = R × 2^((t − refTemp) / halveEvery) | `refTemp`(기본 20), `halveEvery`(기본 10) |
| `deviation` | 기준값 대비 % | (측정 − ref) / ref × 100 | `ref` (기준값, unit) |
| `vdrop` | 전압강하율 | (공급 − 부하) / (nominal 또는 공급) × 100 | `nominal` (선택) |
| `imbalance` | 상간 불평형 | (최대 − 최소) / 평균 × 100 | `phases` 예 "U,V,W" |
| `contact` | 단선·접촉불량 | 측정 − 리드선 저항 (OL이면 단선) | — |

사진은 파일 안에 data URL(png/jpeg/webp)로만 넣습니다. 인터넷 주소(https://…)로 된 사진은 앱이 무시합니다. 앱에서 직접 찍은 사진을 항목에 추가할 수도 있습니다(긴 변 1600px로 줄여 저장).

판정: 정상 범위 안 → 정상, 정상 밖이지만 주의 범위 안 → 주의, 둘 다 밖 → 이상.

## 백업 파일
앱의 "백업·기타 → 백업 파일 저장"은 `"format": "ktx-meas-backup"` 파일로 항목과 기록을 모두 저장합니다. 이 파일도 보안 자료입니다.
