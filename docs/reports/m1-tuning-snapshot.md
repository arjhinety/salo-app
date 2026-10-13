# M1 snapshot: tuning evenings, UNTUNED parameters

Development check only. The parameters are untuned starting values, so these numbers are not results.
Only tuning evenings E01-E10 were run.

| Policy | Food rescued (kg, mean/evening) | Food wasted (kg) | Worst-served need met (mean) | Stranded awards (mean) |
|---|---|---|---|---|
| salo | 150.2 | 25.4 | 0.00 | 0.3 |
| fcfs | 135.9 | 39.7 | 0.00 | 0.1 |
| nearest | 144.7 | 31.0 | 0.00 | 0.2 |
| central_greedy | 151.2 | 24.4 | 0.00 | 0.1 |

## Driver rule (D-Q1)

On E01-E10 under Salo (545 driver rounds):

- Earliest-ETA rule: reliability broke an ETA tie in 239 rounds (43.9%). Counted on arrivals rounded to whole minutes (see the caveat below).
- The most-reliable rule would have picked a different driver in 513 rounds (94.1%).

**Rounding caveat:** arrivals are rounded up to whole minutes, so most of these ties are rounding ties. On exact arrival times, reliability broke a tie in 68 of 545 rounds (12.5%); within a 1-minute band, 384 of 545 (70.5%). Quote the rounded figure only with these counts (decisions.md, D-Q1 evidence).

D-Q1 is final: earliest ETA, reliability breaks ties (decisions.md).

## Replay excerpt: E01, Salo, first two lots

```
17:10  CALL_FOR_PROPOSALS L0030 to pantries
17:10    state L0030: announced
17:10  PROPOSE L0030 P01 bids 15 (value 0.88)
17:10  REFUSE L0030 P07 (no_remaining_need)
17:10  PROPOSE L0030 P21 bids 14 (value 0.84)
17:10  PROPOSE L0030 P25 bids 10 (value 0.61)
17:10  PROPOSE L0030 P27 bids 12 (value 0.69)
17:11  PROPOSE L0030 P10 bids 11 (value 0.66)
17:11  REFUSE L0030 P11 (closed_before_earliest_arrival)
17:11  PROPOSE L0030 P28 bids 10 (value 0.57)
17:12  CALL_FOR_PROPOSALS L0017 to pantries
17:12    state L0017: announced
17:12  PROPOSE L0030 P04 bids 10 (value 0.59)
17:12  PROPOSE L0030 P05 bids 11 (value 0.62)
17:12  PROPOSE L0030 P08 bids 14 (value 0.85)
17:12  PROPOSE L0030 P19 bids 14 (value 0.83)
17:12  PROPOSE L0030 P30 bids 11 (value 0.65)
17:12  REFUSE L0017 P11 (closed_before_earliest_arrival)
17:12  PROPOSE L0017 P22 bids 15 (value 0.88)
17:12  PROPOSE L0017 P25 bids 12 (value 0.69)
17:12  PROPOSE L0017 P26 bids 15 (value 0.90)
17:13  PROPOSE L0030 P06 bids 10 (value 0.56)
17:13  PROPOSE L0030 P17 bids 15 (value 0.91)
17:13  PROPOSE L0030 P18 bids 14 (value 0.81)
17:13  PROPOSE L0030 P20 bids 11 (value 0.63)
17:13  PROPOSE L0030 P24 bids 14 (value 0.85)
17:13  PROPOSE L0017 P02 bids 11 (value 0.65)
17:13  PROPOSE L0017 P06 bids 10 (value 0.61)
17:13  PROPOSE L0017 P15 bids 16 (value 0.95)
17:13  PROPOSE L0017 P19 bids 15 (value 0.86)
17:13  PROPOSE L0017 P24 bids 15 (value 0.91)
17:13  PROPOSE L0017 P29 bids 15 (value 0.91)
17:14  PROPOSE L0030 P02 bids 10 (value 0.60)
17:14  PROPOSE L0030 P09 bids 10 (value 0.59)
17:14  PROPOSE L0030 P14 bids 12 (value 0.70)
17:14  PROPOSE L0030 P15 bids 15 (value 0.90)
17:14  PROPOSE L0030 P23 bids 11 (value 0.66)
17:14  REFUSE L0017 P07 (no_remaining_need)
17:14  PROPOSE L0017 P21 bids 15 (value 0.89)
17:14  PROPOSE L0017 P23 bids 12 (value 0.71)
17:14  PROPOSE L0017 P28 bids 11 (value 0.65)
17:14  PROPOSE L0017 P30 bids 12 (value 0.71)
17:15  PROPOSE L0030 P03 bids 14 (value 0.84)
17:15  PROPOSE L0030 P12 bids 14 (value 0.85)
17:15  PROPOSE L0030 P13 bids 11 (value 0.66)
17:15  PROPOSE L0030 P16 bids 12 (value 0.72)
17:15  PROPOSE L0030 P22 bids 16 (value 0.97)
17:15  PROPOSE L0030 P26 bids 15 (value 0.86)
17:15  PROPOSE L0030 P29 bids 16 (value 0.94)
17:15  TENTATIVE_ACCEPT L0030 -> P22 (16 shares)
17:15    state L0030: tentative
17:15  PROPOSE L0017 P03 bids 16 (value 0.92)
17:15  PROPOSE L0017 P04 bids 11 (value 0.64)
17:15  PROPOSE L0017 P05 bids 12 (value 0.71)
17:15  PROPOSE L0017 P08 bids 16 (value 0.94)
17:15  PROPOSE L0017 P09 bids 11 (value 0.64)
17:15  PROPOSE L0017 P10 bids 12 (value 0.69)
17:15  PROPOSE L0017 P13 bids 11 (value 0.66)
17:15  PROPOSE L0017 P16 bids 11 (value 0.64)
17:15  PROPOSE L0017 P18 bids 15 (value 0.88)
17:15  PROPOSE L0017 P27 bids 11 (value 0.66)
17:15  CALL_FOR_PROPOSALS L0030 to drivers
17:15  PROPOSE L0030 driver V01 ETA 17:38 reliability 0.85
17:15  PROPOSE L0030 driver V02 ETA 18:19 reliability 0.50
17:15  PROPOSE L0030 driver V03 ETA 17:41 reliability 0.40
17:15  PROPOSE L0030 driver V04 ETA 18:19 reliability 0.86
17:15  PROPOSE L0030 driver V05 ETA 18:10 reliability 0.67
17:15  PROPOSE L0030 driver V06 ETA 18:14 reliability 0.50
17:15  PROPOSE L0030 driver V07 ETA 17:30 reliability 0.93
17:15  PROPOSE L0030 driver V08 ETA 18:19 reliability 0.89
17:15  PROPOSE L0030 driver V09 ETA 18:12 reliability 0.92
17:15  PROPOSE L0030 driver V10 ETA 17:35 reliability 0.78
17:15  PROPOSE L0030 driver V11 ETA 18:19 reliability 0.85
17:15  PROPOSE L0030 driver V12 ETA 17:28 reliability 0.57
17:15  PROPOSE L0030 driver V13 ETA 17:33 reliability 0.76
17:15  PROPOSE L0030 driver V14 ETA 17:40 reliability 0.92
17:15  PROPOSE L0030 driver V15 ETA 17:34 reliability 0.88
17:15  PROPOSE L0030 driver V16 ETA 17:37 reliability 0.88
17:15  PROPOSE L0030 driver V17 ETA 17:36 reliability 0.83
17:15  PROPOSE L0030 driver V18 ETA 17:29 reliability 0.88
17:15  PROPOSE L0030 driver V19 ETA 17:34 reliability 0.88
17:15  PROPOSE L0030 driver V20 ETA 18:15 reliability 0.50
17:15  PROPOSE L0030 driver V21 ETA 17:26 reliability 0.94
17:15  PROPOSE L0030 driver V22 ETA 17:36 reliability 0.76
17:15  PROPOSE L0030 driver V23 ETA 18:17 reliability 0.80
17:15  PROPOSE L0030 driver V24 ETA 17:41 reliability 0.91
17:15  PROPOSE L0030 driver V25 ETA 18:23 reliability 0.88
17:15  PROPOSE L0030 driver V26 ETA 17:26 reliability 0.86
17:15  PROPOSE L0030 driver V27 ETA 17:26 reliability 0.56
17:15  PROPOSE L0030 driver V28 ETA 17:28 reliability 0.60
17:15  PROPOSE L0030 driver V29 ETA 18:17 reliability 0.89
17:15  PROPOSE L0030 driver V30 ETA 17:38 reliability 0.86
17:15  PROPOSE L0030 driver V31 ETA 18:18 reliability 0.75
17:15  PROPOSE L0030 driver V32 ETA 18:12 reliability 0.95
17:15  PROPOSE L0030 driver V33 ETA 17:35 reliability 0.88
17:15  PROPOSE L0030 driver V34 ETA 17:35 reliability 0.88
17:15  PROPOSE L0030 driver V35 ETA 17:31 reliability 0.75
17:15  PROPOSE L0030 driver V36 ETA 17:35 reliability 0.82
17:15  PROPOSE L0030 driver V37 ETA 17:31 reliability 0.89
17:15  PROPOSE L0030 driver V38 ETA 18:26 reliability 0.79
17:15  PROPOSE L0030 driver V39 ETA 18:25 reliability 0.94
17:15  PROPOSE L0030 driver V40 ETA 18:20 reliability 0.83
17:15  COMMIT L0030 driver V21 -> P22 by 17:26
17:15    state L0030: final
17:16  PROPOSE L0017 P01 bids 15 (value 0.91)
17:16  PROPOSE L0017 P12 bids 16 (value 0.92)
17:16  PROPOSE L0017 P20 bids 12 (value 0.71)
17:17  PROPOSE L0017 P14 bids 11 (value 0.67)
17:17  PROPOSE L0017 P17 bids 16 (value 0.94)
17:17  TENTATIVE_ACCEPT L0017 -> P15 (16 shares)
17:17    state L0017: tentative
17:17  CALL_FOR_PROPOSALS L0017 to drivers
17:17  PROPOSE L0017 driver V01 ETA 17:37 reliability 0.85
17:17  PROPOSE L0017 driver V02 ETA 18:21 reliability 0.50
17:17  PROPOSE L0017 driver V03 ETA 17:36 reliability 0.40
17:17  PROPOSE L0017 driver V04 ETA 18:18 reliability 0.86
17:17  PROPOSE L0017 driver V05 ETA 18:22 reliability 0.67
17:17  PROPOSE L0017 driver V06 ETA 18:10 reliability 0.50
17:17  PROPOSE L0017 driver V08 ETA 18:19 reliability 0.89
17:17  PROPOSE L0017 driver V09 ETA 18:16 reliability 0.92
17:17  PROPOSE L0017 driver V10 ETA 17:34 reliability 0.78
17:17  PROPOSE L0017 driver V11 ETA 18:17 reliability 0.85
17:17  PROPOSE L0017 driver V12 ETA 17:32 reliability 0.57
17:17  PROPOSE L0017 driver V13 ETA 17:29 reliability 0.76
17:17  PROPOSE L0017 driver V14 ETA 17:33 reliability 0.92
17:17  PROPOSE L0017 driver V15 ETA 17:30 reliability 0.88
17:17  PROPOSE L0017 driver V16 ETA 17:35 reliability 0.88
17:17  PROPOSE L0017 driver V17 ETA 17:34 reliability 0.83
17:17  PROPOSE L0017 driver V18 ETA 17:29 reliability 0.88
17:17  PROPOSE L0017 driver V19 ETA 17:36 reliability 0.88
17:17  PROPOSE L0017 driver V20 ETA 18:14 reliability 0.50
17:17  PROPOSE L0017 driver V21 ETA 17:42 reliability 0.94
17:17  PROPOSE L0017 driver V22 ETA 17:36 reliability 0.76
17:17  PROPOSE L0017 driver V23 ETA 18:11 reliability 0.80
17:17  PROPOSE L0017 driver V24 ETA 17:37 reliability 0.91
17:17  PROPOSE L0017 driver V25 ETA 18:19 reliability 0.88
17:17  PROPOSE L0017 driver V26 ETA 17:31 reliability 0.86
17:17  PROPOSE L0017 driver V27 ETA 17:30 reliability 0.56
17:17  PROPOSE L0017 driver V28 ETA 17:30 reliability 0.60
17:17  PROPOSE L0017 driver V29 ETA 18:16 reliability 0.89
17:17  PROPOSE L0017 driver V31 ETA 18:15 reliability 0.75
17:17  PROPOSE L0017 driver V32 ETA 18:15 reliability 0.95
17:17  PROPOSE L0017 driver V33 ETA 17:33 reliability 0.88
17:17  PROPOSE L0017 driver V34 ETA 17:36 reliability 0.88
17:17  PROPOSE L0017 driver V35 ETA 17:33 reliability 0.75
17:17  PROPOSE L0017 driver V36 ETA 17:31 reliability 0.82
17:17  PROPOSE L0017 driver V37 ETA 17:29 reliability 0.89
17:17  PROPOSE L0017 driver V38 ETA 18:25 reliability 0.79
17:17  PROPOSE L0017 driver V39 ETA 18:25 reliability 0.94
17:17  PROPOSE L0017 driver V40 ETA 18:19 reliability 0.83
17:17  COMMIT L0017 driver V37 -> P15 by 17:29
17:17    state L0017: final
17:26  DELIVERY L0030 4 kg to P22 by V21
17:26    state L0030: delivered
17:29  DELIVERY L0017 8 kg to P15 by V37
17:29    state L0017: delivered
```
