#!/usr/bin/env bash

rm -r Stats
mkdir Stats
mkdir Stats/moveset

function process {
	tier=$1
	if [[ $tier == "moveset" ]]; then
		return
	fi

	echo "Processing "$tier >> log.log

	if [[ $tier == "gen9ou" ]] || [[ $tier == "gen9doublesou" ]] || [[ $tier == "gen9randombattle" || $tier == 'gen9oususpecttest' ]] || [[ $tier == "gen9doublesoususpecttest" ]]; then
		python StatCounter.py $tier 1695 &&
		python batchMovesetCounter.py $tier 1695 > Stats/moveset/$tier-1695.txt
#		python MegaCounter.py Stats/chaos/$tier-1695.json > Stats/mega/$tier-1695.txt
	else
		python StatCounter.py $tier 1630 &&
		python batchMovesetCounter.py $tier 1630 > Stats/moveset/$tier-1630.txt
#		python MegaCounter.py Stats/chaos/$tier-1630.json > Stats/mega/$tier-1630.txt
	fi

}
export -f process
function nextprocess {
	tier=$1
	if [[ $tier == "moveset" ]]; then
		return
	fi

	echo "Processing "$tier >> log.log

	if [[ $tier == "gen9ou" ]] || [[ $tier == "gen9doublesou" ]] || [[ $tier == "gen9randombattle" || $tier == 'gen9oususpecttest' ]] || [[ $tier == "gen9doublesoususpecttest" ]]; then
		python StatCounter.py $tier 1825 &&
		python batchMovesetCounter.py $tier 1825 > Stats/moveset/$tier-1825.txt
#		python MegaCounter.py Stats/chaos/$tier-1825.json > Stats/mega/$tier-1825.txt
	else
		python StatCounter.py $tier 1760 &&
		python batchMovesetCounter.py $tier 1760 > Stats/moveset/$tier-1760.txt
#		python MegaCounter.py Stats/chaos/$tier-1760.json > Stats/mega/$tier-1760.txt
	fi

	python StatCounter.py $tier 0 &&
	python batchMovesetCounter.py $tier 0 > Stats/moveset/$tier-0.txt
#	python MegaCounter.py Stats/chaos/$tier-0.json > Stats/mega/$tier-0.txt


	python StatCounter.py $tier 1500 &&
	python batchMovesetCounter.py $tier 1500 > Stats/moveset/$tier-1500.txt
#	python MegaCounter.py Stats/chaos/$tier-1500.json > Stats/mega/$tier-1500.txt
	
	
}
export -f nextprocess

ls -S Raw/ | parallel -j 5 process
ls -S Raw/ | parallel -j 5 nextprocess
./MonotypeAnalysis.sh
