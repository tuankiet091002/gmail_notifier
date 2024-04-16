'use strict';

const classifier = {};
{
    const lemmatizer = new Lemmatizer();
    let stats = {
        totalDocuments: 0,
        // document frequency table for each category
        docCount: {},
        // for each category, how many words total were mapped to it
        wordCount: {},
        // for each category, how frequent was a given word mapped to it
        wordFrequencyCount: {},
        // for each word, how many document contains it
        wordDocumentCount: {},
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
                                                    for (let i = 1; i < n; i++) {
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
    once()

    const initiateLabel = (labelName) => {
        if (!stats.labels[labelName]) {
            stats.docCount[labelName] = 0;
            stats.wordCount[labelName] = 0;
            stats.wordFrequencyCount[labelName] = {};
            stats.wordDocumentCount[labelName] = 0;
            stats.labels[labelName] = true;
        }
    }

    const deepText = node => {
        let A = [];
        if (node) {
            node = node.firstChild;
            while (node != null) {
                if (node.nodeType === 3) A[A.length] = node.textContent;
                else A = A.concat(deepText(node));
                node = node.nextSibling;
            }
        }
        return A;
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
        return text.filter(n => /\S/.test(n))
            .map(n => n.toLowerCase().replace(/[0-9\s`!@#$%^&*()_\-+=\[\]{}:;"<>,.?/|\\·]/g, " ")
                .replace(/n't/g, "")
                .replace(/'([sdm]|ll|ve|re)/g, "")
                .split(" ")
                .filter(m => m && !/'+/.test(m) && !binarySearch(m, stats.stopwords))
                .map(m => lemmatizer.only_lemmas(m)[0] || m))
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
        return Math.log(stats.totalDocuments / stats.wordDocumentCount[token])
    }

    const tokenLikelihood = (token, label) => {

        const wordDocCount = stats.wordDocumentCount[label][token] || 0

        // what is the count of all words that have ever been mapped to this category
        const docCount = stats.docCount[label]

        return wordDocCount / docCount;
    }

    const docPrior = (label) => {
        return stats.docCount[label] / stats.totalDocuments;
    }

    const tokenEvidence = (token, label) => {
        let totalToken = 0;
        Object.keys(labels).map(label => totalToken += stats.wordFrequencyCount[label][token] || 0)
        return stats.wordFrequencyCount[label][token] / totalToken;
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

                if (!stats.wordDocumentCount[token])
                    stats.wordDocumentCount[token] = 1
                else
                    stats.wordDocumentCount[token] += 1

                if (!stats.wordFrequencyCount[label][token]) {
                    stats.wordFrequencyCount[label][token] = frequencyInContent
                } else {
                    stats.wordFrequencyCount[label][token] += frequencyInContent
                }

                stats.wordCount[label] += frequencyInContent
            })

            resolve();
        })

    }

    classifier.classify = content => {
        let maxProbability = -Infinity, chosenLabel = null

        const textNodeList = deepText(content)
        const tokenList = tokenize(textNodeList)
        const frequencyTable = frequency(tokenList)

        Object.keys(labels).forEach(label => {
            // P(Ci|E) = P(E|Ci) * P(Ci) / P(E)
            // P(E)
            const labelProbability = docCount[label] / totalDocuments;
            let logProbability = Math.log(labelProbability);

            Object.keys(frequencyTable).forEach(token => {
                // weight parameter
                const frequencyInLabel = frequencyTable[token]
                const tf = frequencyInLabel / tokenList.length;
                const idf = inverseDocFrequency(token);
                // bayes theorem
                const likelihood = tokenLikelihood(token, label)
                const prior = docPrior(label)
                const evidence = tokenEvidence(token, label)
                // tf + idf + likelihood - prior + evidence
                logProbability += Math.log(tf) + Math.log(idf) + Math.log(likelihood) + Math.log(prior) - Math.log(evidence)

                console.log('log probability is: ' + logProbability)
            })

            if (logProbability > maxProbability) {
                maxProbability = logProbability
                chosenLabel = label
            }
        })
        return {
            result: chosenLabel,
            map: new Map()
        }
    }

    classifier.start = () => {
        chrome.runtime.sendMessage({method: "fetch-stats"}, prefs => console.log(prefs))
    }
}