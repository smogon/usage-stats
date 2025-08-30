#!/usr/bin/env bash

function process {
	tier=gen9monotype
	tag=$1

	echo "Processing "$tag >> log.log

	python StatCounter.py $tier 1630 $tag &&
	python batchMovesetCounter.py $tier 1630 $tag > Stats/moveset/$tier-$tag-1630.txt
#	python MegaCounter.py Stats/chaos/$tier-$tag-1630.json > Stats/mega/$tier-$tag-1630.txt


	python StatCounter.py $tier 1760 $tag &&
	python batchMovesetCounter.py $tier 1760 $tag > Stats/moveset/$tier-$tag-1760.txt
#	python MegaCounter.py Stats/chaos/$tier-$tag-1760.json > Stats/mega/$tier-$tag-1760.txt

	python StatCounter.py $tier 0 $tag &&
	python batchMovesetCounter.py $tier 0 $tag > Stats/moveset/$tier-$tag-0.txt
#	python MegaCounter.py Stats/chaos/$tier-$tag-0.json > Stats/mega/$tier-$tag-0.txt


	python StatCounter.py $tier 1500 $tag &&
	python batchMovesetCounter.py $tier 1500 $tag > Stats/moveset/$tier-$tag-1500.txt
#	python MegaCounter.py Stats/chaos/$tier-$tag-1500.json > Stats/mega/$tier-$tag-1500.txt



}
export -f process

parallel -j 5 process ::: mononormal monofighting monoflying monopoison monoground monorock monobug monoghost monosteel monofire monowater monograss monoelectric monopsychic monoice monodragon monodark monofairy
mkdir Stats/monotype
mv Stats/gen9monotype-mono* Stats/monotype/.
for d in chaos leads metagame moveset
do
	mkdir Stats/monotype/$d
	mv Stats/$d/gen9monotype-mono* Stats/monotype/$d/.
done

function process2 {
	tier=$1
	tag=muchart

	echo "Processing "$tier >> log.log

	python MonotypeMUChart.py $tier 1630 $tag

	python MonotypeMUChart.py $tier 1760 $tag

	python MonotypeMUChart.py $tier 0 $tag

	python MonotypeMUChart.py $tier 1500 $tag
}
export -f process2

parallel -j 2 process2 ::: gen9monotype gen9nationaldexmonotype

mkdir Stats/monotype/matchupcharts
mv Stats/gen9monotype-matchup* Stats/monotype/matchupcharts/.
mv Stats/gen9nationaldexmonotype-matchup* Stats/monotype/matchupcharts/.
