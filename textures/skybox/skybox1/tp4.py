import cv2 as cv
import numpy as np
import math

def rotate(img, angle=0, x=0, y=0):
    M = cv.getRotationMatrix2D((x,y),angle,1)
    return cv.warpAffine(img, M, (img.shape[1],img.shape[0]))


img = cv.imread("left.bmp", 1)

dst = rotate(img, -90, (img.shape[1]-1)/2.0, (img.shape[0]-1)/2.0)

cv.imwrite("left2.bmp", dst)

