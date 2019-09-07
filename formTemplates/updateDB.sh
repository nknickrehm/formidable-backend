#!/bin/bash
mongo ba --eval 'db.forms.drop()'

for f in *.json
do
  mongoimport --db ba --collection forms --file $f
done