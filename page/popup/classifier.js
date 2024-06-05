'use strict';

const classifier = {};
const classifyCached = new Map()
{
    const lemmatizer = new Lemmatizer();
    let stats = {
        totalDocuments: 0,
        totalWords: 0,
        // document frequency table for each category
        docCount: {},
        // for each category, how frequent was a given word mapped to it
        wordFrequencyCount: {},
        // for each word, how many document contains it
        wordAppearanceCount: {},
        labels: {},
        stopwords: []
    }

    const once = () => {
        chrome.runtime.sendMessage({method: "fetch-stats"}, res => {
                stats = res
                if (!Object.keys(stats.stopwords).length) {
                    fetch('/data/classifier-datas/stopwords.json')
                        .then((response) => response.json())
                        .then((json) => {
                                stats.stopwords = json
                                fetch('/data/classifier-datas/data.csv')
                                    .then((response) => response.text())
                                    .then(res => Papa.parse(res, {
                                            complete: (data) => {
                                                const proceedData = async () => {
                                                    data.data.map(x => x.length = 2)
                                                    for (let i = 1; i < data.data.length; i++) {
                                                        await classifier.train(data.data[i][1], data.data[i][0])
                                                    }
                                                }

                                                proceedData().then(() => {
                                                    chrome.runtime.sendMessage({
                                                        method: "replace-stats",
                                                        data: stats
                                                    }, () => chrome.runtime.lastError)
                                                })

                                            }
                                        }
                                    ))

                            }
                        )
                }
            }
        )
    }
    document.addEventListener('DOMContentLoaded', once);

    const initiateLabel = (labelName) => {
        if (!stats.labels[labelName]) {
            stats.docCount[labelName] = 0;
            stats.wordFrequencyCount[labelName] = {};
            stats.wordAppearanceCount[labelName] = {};
            stats.labels[labelName] = true;
        }
    }

    const decorate = (node, result) => {
        if (node) {
            // depth first search
            Array.from(node.childNodes).forEach(childNode => {
                    if (childNode.nodeType === 3 && /\S/.test(childNode.textContent)) {
                        let currentLabel, spanNode = document.createElement("span");
                        const wordList = childNode.textContent.split(" ")
                        // console.log(childNode.textContent)
                        wordList.forEach((word, index) => {
                            const proceededWords = word.replace(/[0-9\s`!@#$%^&*()_\-–+=\[\]{}:;"<>,.?/|\\·・•©]/g, " ")
                                .replace(/n[’']t/g, "")
                                .replace(/[’']([sdm]|ll|ve|re)/g, "")
                                .toLowerCase().split(" ").filter(w => w)

                            // console.log(" ===> " + JSON.stringify(proceededWords))

                            // average label score for composite token
                            let stopWords = 0, label
                            let multipliedScore = Number(proceededWords.map(pWord => {
                                if (binarySearch(pWord, stats.stopwords)) {
                                    stopWords++;
                                    return 0;
                                } else {
                                    const lemma = lemmatizer.only_lemmas(pWord)[0] || pWord
                                    // console.log(`${lemma}: ${result[lemma] || "can't find ${lemma}"}`)
                                    return result[lemma] || 0.5
                                }
                            }).reduce((S, v) => S + v, 0))

                            if (stopWords === proceededWords.length) label = "none"
                            else {
                                const score = multipliedScore / (proceededWords.length - stopWords)
                                if (score > -4) label = "danger"
                                else if (score > -8) label = "neutral"
                                else label = "safe"
                            }

                            const labelColor = (label) => {
                                let color;
                                switch (label) {
                                    case "danger":
                                        color = "#EF4444";
                                        break;
                                    case "neutral":
                                        color = "#FDE047";
                                        break;
                                    case "safe":
                                        color = "#22C55E"
                                        break;
                                    default:
                                        color = "none";

                                }
                                return color;
                            }

                            if (label !== currentLabel && spanNode.innerText) {
                                // remove last whitespace
                                spanNode.innerText = spanNode.innerText.slice(0, -1)

                                spanNode.style.backgroundColor = labelColor(currentLabel)
                                // insert the old one into parent node list
                                node.insertBefore(spanNode, childNode)

                                // insert last white space for next portion of text
                                const lastWhiteSpace = document.createTextNode(" ")
                                node.insertBefore(lastWhiteSpace, childNode)

                                // new span for next portion of paragraph
                                spanNode = document.createElement("span")
                            }
                            spanNode.innerText += word + " "
                            if (index === wordList.length - 1) {
                                if (label === currentLabel)
                                    spanNode.innerText = spanNode.innerText.slice(0, -1)

                                spanNode.style.backgroundColor = labelColor(label)
                                node.insertBefore(spanNode, childNode)
                            }

                            currentLabel = label
                        })

                        node.removeChild(childNode)
                    }
                    // next node
                    decorate(childNode, result)
                }
            )
        }
        return node;
    }

    const binarySearch = (x, arr) => {
        let start = 0, end = arr.length - 1;

        // iterate while start not meets end
        while (start <= end) {

            // Find the middle index
            let mid = Math.floor((start + end) / 2);

            // if element is present at mid, return True
            if (arr[mid] === x) return true;

            // else look in left or right half accordingly
            else if (arr[mid] < x)
                start = mid + 1;
            else
                end = mid - 1;
        }
        return false;
    }

    const tokenize = (text) => {
        // remove escape character => remove special character => split to array => filter stopword => lemmatize => merge
        return text.toLowerCase().replace(/[0-9\s`!@#$%^&*()_\-–+=\[\]{}:;"<>,.?/|\\·・•©]/g, " ")
            .replace(/n[’']t/g, "")
            .replace(/[’']([sdm]|ll|ve|re)/g, "")
            .split(" ")
            .filter(m => m && !/'+/.test(m) && !binarySearch(m, stats.stopwords))
            .map(m => lemmatizer.only_lemmas(m)[0] || m)
            .flat(Infinity)
    }

    const frequency = (tokens) => {
        let frequencyTable = Object.create(null)

        tokens.forEach(token => {
            if (!frequencyTable[token])
                frequencyTable[token] = 1
            else
                frequencyTable[token]++
        })

        return frequencyTable
    }

    const inverseDocFrequency = token => {
        let wordDocCount = 0;
        Object.keys(stats.labels).map(l => {
            wordDocCount += stats.wordFrequencyCount[l][token] || 0
        })
        return Math.log(stats.totalDocuments / (wordDocCount + 1))
    }

    const tokenLikelihood = (token, label) => {

        const wordLabelCount = stats.wordAppearanceCount[label][token] || 0;

        // what is the count of all words that have ever been mapped to this category
        const docCount = stats.docCount[label]

        return (wordLabelCount + 1) / docCount;
    }

    classifier.train = (content, label) => {
        return new Promise((resolve) => {
            initiateLabel(label)
            stats.docCount[label]++;
            stats.totalDocuments++;

            const tokenList = tokenize(content)
            const frequencyTable = frequency(tokenList)
            Object.keys(frequencyTable).forEach(token => {
                const frequencyInContent = frequencyTable[token]

                if (!stats.wordAppearanceCount[label][token])
                    stats.wordAppearanceCount[label][token] = 1
                else
                    stats.wordAppearanceCount[label][token] += 1

                if (!stats.wordFrequencyCount[label][token]) {
                    stats.wordFrequencyCount[label][token] = frequencyInContent
                } else {
                    stats.wordFrequencyCount[label][token] += frequencyInContent
                }

                stats.totalWords += frequencyInContent
            })
            resolve();
        })

    }

    classifier.trainHtml = (id, content, label) => {
        if (classifyCached.has(id))
            classifyCached.delete(id)

        return classifier.train(content.innerText, label);
    }

    classifier.classify = (id, content) => {
        if (classifyCached.has(id)) {
            return classifyCached.get(id)
        }

        let maxProbability = -Infinity, chosenLabel = null

        const tokenList = tokenize(content.innerText)
        const frequencyTable = frequency(tokenList)
        let result = {}
        let labels = {}

        Object.keys(stats.labels).forEach(label => {
            result[label] = {}
            const prior = (stats.docCount[label] + 1) / stats.totalDocuments;
            let logProbability = 0;

            Object.keys(frequencyTable).forEach(token => {
                // weight parameter
                const frequencyInLabel = frequencyTable[token]
                const tf = frequencyInLabel / tokenList.length;
                const idf = inverseDocFrequency(token);
                // P(w|c)
                const likelihood = tokenLikelihood(token, label)

                result[label][token] = Math.log(likelihood) + Math.log(prior)
                logProbability += tf * idf * result[label][token]

            })
            labels[label] = logProbability
            if (logProbability > maxProbability) {
                maxProbability = logProbability
                chosenLabel = label
            }
        })

        const returnObj = {
            chosenLabel: chosenLabel === "ham" ? "safe" : "spam",
            labels,
            content,
            decoratedContent: decorate(content, result[chosenLabel]),
        }

        classifyCached.set(id, returnObj)
        return returnObj;
    }
}