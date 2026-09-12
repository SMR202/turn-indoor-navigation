# Project brief
Updated: 2026-09-12

## Confirmed project context
Source: user's setup request and referenced conversation “Plan Daily Automation Loop”, recovered 2026-09-12.
- TURN aims to provide indoor navigation for malls/buildings.
- Work includes converting floor plans into navigable maps, positioning and routing.
- Candidate positioning inputs: PDR/IMU, magnetic fingerprints, BLE and optional Wi-Fi; map constraints should limit impossible motion.
- Both Android and iOS are targets. Wi-Fi cannot be a universal dependency.
- The team has early mapping, PDR/magnetic and Wi-Fi experiments. Their datasets, results and reproducibility have not been supplied here.
- Speed matters: adopt/adapt existing work wherever viable; focus original effort on integration and measured weaknesses.
- This phase creates docs and performs an acceleration audit, not production code.

## Outcome
A reproducible path from a venue floor plan and smartphone observations to a useful indoor route and uncertainty-aware location estimate.

## Unknowns
Target venue, team ownership, phone models, minimum OS versions, accuracy/latency/battery acceptance thresholds, beacon budget, floor-plan formats/rights and deadline remain unconfirmed.
Existing local Android and Expo research folders were observed, but are not reviewed or imported. Their presence does not establish working capabilities.

## Scope update — 2026-09-12
The user explicitly requests starting from scratch with this repository. Previous local/team experiments, implementations and logs are excluded from the new baseline and are not required inputs. Retain this repository's knowledge base and acceleration audit, and continue evaluating licensed external reuse. See [device inventory](DEVICE_INVENTORY.md) for user-reported phones; OS versions and hardware behavior are unverified.
