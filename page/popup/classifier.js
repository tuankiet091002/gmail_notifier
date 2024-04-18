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
                                                    const n = data.data.length
                                                    for (let i = 1; i < 3000; i++) {
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
            Array.from(node.childNodes).forEach(childNode => {
                    if (childNode.nodeType === 3 && /\S/.test(childNode.textContent)) {
                        let spanNode, currentLabel;
                        let insertLocation = childNode
                        childNode.textContent.split(" ").forEach(word => {
                            const proceededWords = word.replace(/[0-9\s`!@#$%^&*()_\-–+=\[\]{}:;"<>,.?/|\\·]/g, " ")
                                .replace(/n[’']t/g, "")
                                .replace(/[’']([sdm]|ll|ve|re)/g, "").split(" ")

                            if (!proceededWords.length) {
                                if (spanNode)
                                    spanNode.innerText += word + " "
                                else
                                    spanNode = document.createElement(" ")
                                return;
                            }

                            proceededWords.map(pWord => {
                                let label;
                                if (binarySearch(pWord, stats.stopwords)) label = "neutral"
                                else {
                                    const lemma = lemmatizer.only_lemmas(pWord)[0] || pWord
                                    const score = result[lemma] || 0.5
                                    if (score > -0.15)
                                        label = "safe"
                                    else if (score > -0.5)
                                        label = "dangerous"
                                    else
                                        label = "neutral"
                                }

                                if (!spanNode || label !== currentLabel) {
                                    currentLabel = label;
                                    if (!spanNode)
                                        spanNode = document.createElement('span')
                                    // remove last whitespace
                                    spanNode.innerText = spanNode.innerText.substring(0, spanNode.innerText.length - 1)
                                    spanNode.style.backgroundColor = label === 'dangerous' ? 'red' : label === 'safe' ? "green" : "none"
                                    // insert the old one into parent node list
                                    node.insertBefore(spanNode, insertLocation)
                                    const lastWhiteSpace = document.createTextNode(" ")
                                    node.insertBefore(lastWhiteSpace, insertLocation)

                                    // new span node
                                    spanNode = document.createElement("span")
                                    spanNode.innerText += pWord
                                } else {
                                    spanNode.innerText += pWord + " "
                                }
                            })


                        })
                        // span.innerText = childNode.textContent
                        // span.style.backgroundColor = 'red'
                        // node.insertBefore(span, childNode)
                    }
                    node.removeChild(childNode)
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
        return text.toLowerCase().replace(/[0-9\s`!@#$%^&*()_\-–+=\[\]{}:;"<>,.?/|\\·]/g, " ")
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

    classifier.train = (content, label, rawText = true) => {
        return new Promise((resolve) => {
            initiateLabel(label)
            stats.docCount[label]++;
            stats.totalDocuments++;

            const tokenList = tokenize(rawText ? [content] : content)
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

    classifier.classify = (id, content) => {

        if (classifyCached.has(id)) {
            return classifyCached.get(id)
        }

        let maxProbability = -Infinity, chosenLabel = null

        const tokenList = tokenize(content.innerText)
        console.log(tokenList)
        const frequencyTable = frequency(tokenList)
        let result = {}

        Object.keys(stats.labels).forEach(label => {
            // console.log('///////////LABEL/////////// ' + label)
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

                result[label][token] = Math.log(Math.pow(likelihood * prior, tf * idf))
                logProbability += result[label][token]
                // console.log(token + ": " + Math.exp(logProbability))
            })

            if (logProbability > maxProbability) {
                maxProbability = logProbability
                chosenLabel = label
            }
        })

        const returnObj = {
            result: chosenLabel,
            content: decorate(content, result[chosenLabel]),
        }
        classifyCached.set(id, returnObj)
        return returnObj;
    }
}