import sys
import json
import gzip

from common import *

tier = str(sys.argv[1])
cutoff = 1500 #this is our default, but we can change it for '1337' stats
teamtype = None

if len(sys.argv) > 2:
	cutoff = float(sys.argv[2])
	if len(sys.argv) > 3:
		teamtype = keyify(sys.argv[3])
specs = '-'
if teamtype:
	specs += teamtype+'-'
specs += '{:.0f}'.format(cutoff)

filename="Raw/"+tier#+".txt"
file = gzip.open(filename,'rb')

types = ["mononormal", "monofighting", "monoflying", "monopoison", "monoground", "monorock", "monobug", "monoghost", "monosteel", "monofire", "monowater", "monograss", "monoelectric", "monopsychic", "monoice", "monodragon", "monodark", "monofairy"]
type_index = {t: i for i, t in enumerate(types)}
type_total_usage = {t: 0 for t in types}
monotype_MU_mtx_raw = [[0 for _ in range(18)] for _ in range(18)]
monotype_MU_mtx_percentage = [[0 for _ in range(18)] for _ in range(18)]
monotype_MU_mtx_weighted_raw = [[0 for _ in range(18)] for _ in range(18)]
monotype_MU_mtx_weighted_percentage = [[0 for _ in range(18)] for _ in range(18)]

t=tier
if tier.endswith('suspecttest'):
	t=t[:-11]

for line in file:
	# print(line)
	battles = json.loads(line)

	for battle in battles:
		if 'turns' in battle.keys() and t not in non6v6Formats:
			if battle['turns'] < 3 and t not in nonSinglesFormats:
				continue
			elif battle['turns'] < 2:
				continue
		p1_type = None
		p2_type = None
		for type in types:
			if not p1_type and type in battle['p1']['tags']:
				p1_type = type
			if not p2_type and type in battle['p2']['tags']:
				p2_type = type
		if(p1_type != p2_type):
			type_total_usage[p1_type] += 1
			type_total_usage[p2_type] += 1
		if p1_type and p2_type:
			p1_elo = battle['p1']['rating']
			if(not p1_elo or p1_elo == 0):
				p1_elo = 1000
			p2_elo = battle['p2']['rating']
			if(not p2_elo or p2_elo == 0):
				p2_elo = 1000
			if(battle['p1']['outcome'] == 'win'):
				monotype_MU_mtx_raw[type_index[p1_type]][type_index[p2_type]] += 1
				monotype_MU_mtx_weighted_raw[type_index[p1_type]][type_index[p2_type]] += p1_elo/p2_elo
			else:
				monotype_MU_mtx_raw[type_index[p2_type]][type_index[p1_type]] += 1
				monotype_MU_mtx_weighted_raw[type_index[p2_type]][type_index[p1_type]] += p2_elo/p1_elo
file.close()

for i in range(18):
	for j in range(0, i):
		total = max(monotype_MU_mtx_raw[i][j] + monotype_MU_mtx_raw[j][i], 1)
		weighted_total = max(monotype_MU_mtx_weighted_raw[i][j] + monotype_MU_mtx_weighted_raw[j][i], 1)
		monotype_MU_mtx_percentage[i][j] = monotype_MU_mtx_raw[i][j]/total
		monotype_MU_mtx_percentage[j][i] = monotype_MU_mtx_raw[j][i]/total
		monotype_MU_mtx_weighted_percentage[i][j] = monotype_MU_mtx_weighted_raw[i][j]/weighted_total
		monotype_MU_mtx_weighted_percentage[j][i] = monotype_MU_mtx_weighted_raw[j][i]/weighted_total

total_usage_sum = sum(type_total_usage.values()) or 1
for t in type_total_usage:
	type_total_usage[t] /= total_usage_sum

type_weighted_sum_raw = {t: 0 for t in types}
type_weighted_sum_weighted = {t: 0 for t in types}

for i, t in enumerate(types):
	for j, other in enumerate(types):
		if i == j:
			continue
		type_weighted_sum_raw[t] += type_total_usage[t] * monotype_MU_mtx_percentage[i][j]
		type_weighted_sum_weighted[t] += type_total_usage[t] * monotype_MU_mtx_weighted_percentage[i][j]

sorted_weighted_sum_raw = sorted(type_weighted_sum_raw.items(), key=lambda x: x[1], reverse=True)
sorted_weighted_sum_weighted = sorted(type_weighted_sum_weighted.items(), key=lambda x: x[1], reverse=True)


filename = "Stats/"+tier+"-matchup_chart-"+str(round(cutoff))+".txt"
with open(filename, "w") as mu_chart_file:
    mu_chart_file.write("Match Up Chart Raw \n")
    print_type_mu_chart(mu_chart_file, monotype_MU_mtx_raw, 1)
    mu_chart_file.write("Match Up Chart Percentage \n")
    print_type_mu_chart(mu_chart_file, monotype_MU_mtx_percentage)
    mu_chart_file.write("Unweighted Type Ranking \n")
    for t, val in sorted_weighted_sum_weighted:
        dots = '.' * (30 - len(t))
        mu_chart_file.write(f"{t}{dots}{val*100:.3f}%\n")
    mu_chart_file.write("\n")

    mu_chart_file.write("Match Up Chart Weighted Raw \n")
    print_type_mu_chart(mu_chart_file, monotype_MU_mtx_weighted_raw, 2)
    mu_chart_file.write("Match Up Chart Weighted Percentage \n")
    print_type_mu_chart(mu_chart_file, monotype_MU_mtx_weighted_percentage)
    mu_chart_file.write("Weighted Type Ranking \n")
    for t, val in sorted_weighted_sum_weighted:
        dots = '.' * (30 - len(t))
        mu_chart_file.write(f"{t}{dots}{val*100:.3f}%\n")
    mu_chart_file.write("\n")
