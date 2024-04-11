'use strict';

const classifier = {};
let stopwords = [];

const fetchStopwords = () => {
    fetch('/data/stopwords.json')
        .then((response) => response.json())
        .then((json) => stopwords = json);
}
fetchStopwords();

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

const stemming = content => {
}

const nGrams = content => {
}

const iftdf = content => {
    
}


classifier.classify = content => {
    console.log(stopwords)
}