#!/usr/bin/env bash
# Assumes `npm run build` has been run previously.
# Edit the `month` and `for d in` line as needed.
#
# Usage:
#   ./RunMonthly.sh              full run, including output compression
#   ./RunMonthly.sh --partial    only outputs 1630/1695 files for each tier

logFolder=/mnt/store0/pslogs/main/
month="2026-03"

partial=false
if [[ "$1" == "--partial" ]]; then
	partial=true
fi

mkdir -p Raw
echo $(date)

for d in {1..13}
do
	day=$(printf "%02d" $d)
	for i in $logFolder/$month/*
	do
		tier=$(basename $i)
		if [[ $tier == seasonal* ]] || [[ $tier == *random* ]] || [[ $tier == *computer* ]] || [[ $tier == *custom* ]] || [[ $tier == *petmod* ]] || [[ $tier == *superstaff* ]] || [[ $tier == *factory* ]] || [[ $tier == *challengecup* ]] || [[ $tier == *hackmonscup* ]] || [[ $tier == *digimon* ]] || [[ $tier == *crazyhouse* ]] || [[ $tier == *ferventimpersonation* ]] || [[ $tier == *brokencup* ]] || [[ $tier == *livepatchbattles* ]] || [[ $tier == *deltamon* ]]; then
			echo Skipping $tier/$month-$day
			continue
		fi
		if [ -d $logFolder/$month/$tier/$month-$day ]; then
			echo Processing $tier/$month-$day
			node dist/batchLogReader.js $logFolder/$month/$tier/$month-$day/ $tier
		fi
	echo $(date)
	done
done
echo $(date)

if [[ "$partial" == true ]]; then
	./MonthlyAnalysis.sh --partial
else
	./MonthlyAnalysis.sh
fi

echo $(date)

if [[ "$partial" == false ]]; then
	./CompressStats.sh $month
	echo $(date)
	gzip -r9 Stats/
	echo $(date)
fi
