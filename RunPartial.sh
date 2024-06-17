#!/usr/bin/env bash
#This file is included solely to be used as an example. It will likely need to be heavily modified from month to month
#(or from run to run)

logFolder=/mnt/store0/pslogs/main/
month="2024-05"
mkdir Raw
echo $(date)

for d in {17..25}
do
	day=$(printf "%02d" $d)
	for i in $logFolder/$month/*
	do
		tier=$(basename $i)
		if [[ $tier == seasonal* ]] || [[ $tier == *random* ]] || [[ $tier == *computer* ]] || [[ $tier == *custom* ]] || [[ $tier == *petmod* ]] || [[ $tier == *superstaff* ]] || [[ $tier == *factory* ]] || [[ $tier == *challengecup* ]] || [[ $tier == *hackmonscup* ]] || [[ $tier == *digimon* ]] || [[ $tier == *crazyhouse* ]]; then
			echo Skipping $tier/$month-$day
			continue
		fi
		if [ -d $logFolder/$month/$tier/$month-$day ]; then
			echo Processing $tier/$month-$day
			python batchLogReader.py $logFolder/$month/$tier/$month-$day/ $tier
		fi
	echo $(date)
	done
done
echo $(date)
./PartialAnalysis.sh
echo $(date)
