import string
import sys
import orjson as json
import pickle
from common import keyify,readTable,getBattleFormatsData
reload(sys)
sys.setdefaultencoding('utf8')

def getUsage(filename,col,weight,usage):
	tempUsage, nBattles = readTable(filename)
	for i in tempUsage:
		if keyify(i) not in usage:
			usage[keyify(i)]=[0,0,0,0,0]
		if i != 'empty':
			usage[keyify(i)][col] = usage[keyify(i)][col]+weight*6.0*tempUsage[i]/sum(tempUsage.values())/24

def usageToTiers(usage):
	OU = []
	UU = []
	for i in usage:
		if usage[i][0] > 0.0:
			OU.append([i,usage[i][0]])
		if usage[i][1] > 0.0:
			UU.append([i,usage[i][1]])
	OU = sorted(OU, key=lambda OU:-OU[1])
	UU = sorted(UU, key=lambda UU:-UU[1])
	return (OU,UU)

def makeTable(table,name,keyLookup):

	print("[HIDE="+name+"][CODE]")
	print("Combined usage for "+name)
	print(" + ---- + ------------------ + ------- + ")
	print(" | Rank | Pokemon            | Percent | ")
	print(" + ---- + ------------------ + ------- + ")
	print(' | %-4d | %-18s | %6.3f%% |' % (1,keyLookup[table[0][0]],table[0][1]*100))
	for i in range(1,len(table)):
		if table[i][1] < 0.001:
			break
		print(' | %-4d | %-18s | %6.3f%% |' % (i+1,keyLookup[table[i][0]],100.0*table[i][1]))
	print(" + ---- + ------------------ + ------- + ")
	print("[/CODE][/HIDE]")

def main(months):
	file = open('keylookup.json', 'rb')
	keyLookup = json.loads(file.read())
	file.close()

	rise =  [0.99999999999,0.99515839608,0.04515839608][len(months)-1]
	drop =  [0.01528524706,0.02284003156,0.04515839608][len(months)-1]

	rise =  [0.04515839608,0.04515839608,0.04515839608][len(months)-1]
	#rise =  [0.99515839608,0.99515839608,0.99515839608][len(months)-1]
	drop =  [0.04515839608,0.04515839608,0.04515839608][len(months)-1]
	#drop =  [0.02,0.02284003156,0.04515839608][len(months)-1]

	formatsData = getBattleFormatsData()

	usageBH = {}


	remaining=24.0
	for i in range(len(months)):
		tiername = 'lc'
	
		#bh
		n = {}
		u = {}

		baseline = "1630"
		for k in ('', 'suspecttest', 'alpha', 'beta'):
			try:
				u[k], n[k] = readTable(months[i]+"/Stats/gen9"+tiername+k+"-"+baseline+".txt")

			except IOError:
				pass
		ntot = sum(n.values())
		
		for k in u:
			for poke in u[k]:
				if keyify(poke) not in usageBH:
					usageBH[keyify(poke)]=[0,0]
				if poke != 'empty':
					usageBH[keyify(poke)][0] += n[k]/ntot*u[k][poke]/len(months)


	#generate three-month tables and start working on that new tier list

	(BHOU,BHUU) = usageToTiers(usageBH)
	makeTable(BHOU,"LC (1630 stats)",keyLookup)
	dnuBanlist = []
	for poke in usageBH.keys():
		if usageBH[poke][0] >= drop:
			dnuBanlist.append(poke)

	dnuBanlist = sorted(dnuBanlist)
	printme = "[b]LC UU Banlist:[/b] "
	for poke in dnuBanlist:
		printme += keyLookup[poke]+', '
	printme = printme[:-2]
	print(printme)



if __name__ == "__main__":
    main(sys.argv[1:])

